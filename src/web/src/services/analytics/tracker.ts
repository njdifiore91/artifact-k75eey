import { Analytics } from '@segment/analytics-next'; // v1.55.0
import NewRelic from 'newrelic-browser'; // v1.234.0
import { v4 as uuidv4 } from 'uuid'; // v9.0.0
import { EventCategory, EventProperties } from './events';

/**
 * Comprehensive analytics tracker implementing dual-provider tracking with
 * Segment and New Relic for the Art Knowledge Graph application.
 * Handles session management, performance monitoring, and error tracking.
 */
export class AnalyticsTracker {
  private static instance: AnalyticsTracker;
  private segmentAnalytics: Analytics | null = null;
  private newRelicAgent: typeof NewRelic | null = null;
  private currentUserId: string | null = null;
  private sessionId: string;
  private sessionStartTime: number;
  private eventQueue: Array<{ name: string; properties: EventProperties }> = [];
  private retryCount = 0;
  private readonly maxRetries = 3;
  private readonly queueSize = 100;
  private isInitialized = false;

  private constructor() {
    this.sessionId = uuidv4();
    this.sessionStartTime = Date.now();
  }

  /**
   * Returns singleton instance of the analytics tracker
   */
  public static getInstance(): AnalyticsTracker {
    if (!AnalyticsTracker.instance) {
      AnalyticsTracker.instance = new AnalyticsTracker();
    }
    return AnalyticsTracker.instance;
  }

  /**
   * Initializes analytics services with comprehensive configuration
   * @param segmentKey - Segment write key
   * @param newRelicKey - New Relic license key
   */
  public async initialize(segmentKey: string, newRelicKey: string): Promise<void> {
    try {
      if (this.isInitialized) {
        return;
      }

      // Initialize Segment
      this.segmentAnalytics = new Analytics({
        writeKey: segmentKey,
        retryQueue: true,
        maxRetries: this.maxRetries,
        maxEventsInBatch: 30,
        flushInterval: 10000
      });

      // Initialize New Relic
      window.NREUM = window.NREUM || {};
      window.NREUM.init = { 
        distributed_tracing: { enabled: true },
        privacy: { cookies_enabled: true },
        ajax: { deny_list: ['localhost'] }
      };
      window.NREUM.loader_config = { accountID: newRelicKey };
      this.newRelicAgent = NewRelic;

      // Set up performance monitoring
      this.setupPerformanceMonitoring();
      
      this.isInitialized = true;
    } catch (error) {
      console.error('Analytics initialization failed:', error);
      throw new Error('Failed to initialize analytics services');
    }
  }

  /**
   * Tracks an analytics event across both providers
   * @param eventName - Name of the event to track
   * @param properties - Event properties including category and metadata
   */
  public async trackEvent(
    eventName: string,
    properties: EventProperties
  ): Promise<void> {
    try {
      if (!this.isInitialized) {
        this.queueEvent(eventName, properties);
        return;
      }

      const enrichedProperties = this.enrichEventProperties(properties);

      // Track in Segment
      await this.segmentAnalytics?.track({
        event: eventName,
        properties: enrichedProperties,
        userId: this.currentUserId || undefined
      });

      // Track in New Relic
      this.newRelicAgent?.addPageAction(eventName, enrichedProperties);

      // Track session duration for user engagement metric
      if (properties.category === EventCategory.USER) {
        this.trackSessionDuration();
      }
    } catch (error) {
      this.handleTrackingError(error, eventName, properties);
    }
  }

  /**
   * Identifies user across analytics providers
   * @param userId - Unique user identifier
   * @param traits - User traits and characteristics
   */
  public async identifyUser(
    userId: string,
    traits: Record<string, any>
  ): Promise<void> {
    try {
      if (!this.isInitialized) {
        throw new Error('Analytics not initialized');
      }

      this.currentUserId = userId;

      // Identify in Segment
      await this.segmentAnalytics?.identify({
        userId,
        traits: {
          ...traits,
          sessionId: this.sessionId,
          sessionStartTime: this.sessionStartTime
        }
      });

      // Set user attributes in New Relic
      this.newRelicAgent?.setCustomAttribute('userId', userId);
      Object.entries(traits).forEach(([key, value]) => {
        this.newRelicAgent?.setCustomAttribute(key, value);
      });
    } catch (error) {
      console.error('User identification failed:', error);
      throw error;
    }
  }

  /**
   * Resets analytics state and creates new session
   */
  public async resetAnalytics(): Promise<void> {
    try {
      this.currentUserId = null;
      this.sessionId = uuidv4();
      this.sessionStartTime = Date.now();
      this.eventQueue = [];
      this.retryCount = 0;

      await this.segmentAnalytics?.reset();
      this.newRelicAgent?.interaction();
    } catch (error) {
      console.error('Analytics reset failed:', error);
      throw error;
    }
  }

  /**
   * Sets up performance monitoring configurations
   */
  private setupPerformanceMonitoring(): void {
    if (this.newRelicAgent) {
      this.newRelicAgent.setErrorHandler((error: Error) => {
        this.trackEvent('error_occurred', {
          category: EventCategory.ERROR,
          timestamp: Date.now(),
          userId: this.currentUserId,
          sessionId: this.sessionId,
          metadata: {
            errorMessage: error.message,
            stackTrace: error.stack,
            errorType: error.name
          }
        });
      });

      // Monitor page load performance
      this.newRelicAgent.setPageViewName(window.location.pathname);
      this.newRelicAgent.setCustomAttribute('sessionId', this.sessionId);
    }
  }

  /**
   * Enriches event properties with standard tracking data
   */
  private enrichEventProperties(properties: EventProperties): EventProperties {
    return {
      ...properties,
      sessionId: this.sessionId,
      sessionDuration: Date.now() - this.sessionStartTime,
      timestamp: Date.now(),
      userId: this.currentUserId,
      environment: process.env.NODE_ENV,
      userAgent: navigator.userAgent
    };
  }

  /**
   * Handles tracking errors with retry logic
   */
  private handleTrackingError(
    error: any,
    eventName: string,
    properties: EventProperties
  ): void {
    console.error('Event tracking failed:', error);

    if (this.retryCount < this.maxRetries) {
      this.retryCount++;
      this.queueEvent(eventName, properties);
      setTimeout(() => this.processEventQueue(), 1000 * this.retryCount);
    } else {
      this.trackEvent('tracking_error', {
        category: EventCategory.ERROR,
        timestamp: Date.now(),
        userId: this.currentUserId,
        sessionId: this.sessionId,
        metadata: {
          failedEvent: eventName,
          error: error.message,
          retryCount: this.retryCount
        }
      });
    }
  }

  /**
   * Queues events for later processing
   */
  private queueEvent(eventName: string, properties: EventProperties): void {
    if (this.eventQueue.length < this.queueSize) {
      this.eventQueue.push({ name: eventName, properties });
    }
  }

  /**
   * Processes queued events when online
   */
  private async processEventQueue(): Promise<void> {
    if (!this.isInitialized || this.eventQueue.length === 0) {
      return;
    }

    while (this.eventQueue.length > 0) {
      const event = this.eventQueue.shift();
      if (event) {
        await this.trackEvent(event.name, event.properties);
      }
    }
  }

  /**
   * Tracks session duration for user engagement metrics
   */
  private trackSessionDuration(): void {
    const duration = Date.now() - this.sessionStartTime;
    const durationMinutes = duration / (1000 * 60);

    if (durationMinutes >= 15) {
      this.newRelicAgent?.addPageAction('session_milestone', {
        duration: durationMinutes,
        sessionId: this.sessionId,
        userId: this.currentUserId
      });
    }
  }
}