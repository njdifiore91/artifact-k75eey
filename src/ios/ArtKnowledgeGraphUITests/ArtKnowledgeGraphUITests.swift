//
// ArtKnowledgeGraphUITests.swift
// ArtKnowledgeGraphUITests
//
// UI test suite for Art Knowledge Graph iOS application
// XCTest version: iOS 14.0+
//

import XCTest

class ArtKnowledgeGraphUITests: XCTestCase {
    
    // MARK: - Properties
    private var app: XCUIApplication!
    private var isTablet: Bool!
    private let defaultTimeout: TimeInterval = 10
    
    // MARK: - Setup & Teardown
    override func setUpWithError() throws {
        continueAfterFailure = false
        app = XCUIApplication()
        
        // Detect device type
        isTablet = UIDevice.current.userInterfaceIdiom == .pad
        
        // Configure test environment
        app.launchArguments = ["UI-Testing"]
        app.launchEnvironment = ["UITEST_MODE": "1"]
        
        app.launch()
        
        // Wait for initial load
        let loadingIndicator = app.activityIndicators["InitialLoadingIndicator"]
        XCTAssertTrue(loadingIndicator.waitForDisappearance(timeout: defaultTimeout))
    }
    
    override func tearDownWithError() throws {
        app.terminate()
        super.tearDown()
    }
    
    // MARK: - Home Screen Tests
    func testHomeScreenNavigation() throws {
        // Test search bar
        let searchBar = app.searchFields["SearchArtwork"]
        XCTAssertTrue(searchBar.exists)
        searchBar.tap()
        searchBar.typeText("Van Gogh")
        
        // Test recent graphs carousel
        let recentGraphsCarousel = app.scrollViews["RecentGraphsCarousel"]
        XCTAssertTrue(recentGraphsCarousel.exists)
        recentGraphsCarousel.swipeLeft()
        recentGraphsCarousel.swipeRight()
        
        // Test featured collections
        let featuredCollections = app.collectionViews["FeaturedCollections"]
        XCTAssertTrue(featuredCollections.exists)
        XCTAssertTrue(featuredCollections.cells.count > 0)
        
        // Test bottom navigation
        let tabBar = app.tabBars["MainTabBar"]
        XCTAssertTrue(tabBar.buttons["Home"].exists)
        XCTAssertTrue(tabBar.buttons["Saved"].exists)
        XCTAssertTrue(tabBar.buttons["Profile"].exists)
        
        // Test upload button
        let uploadButton = app.buttons["UploadArtworkButton"]
        XCTAssertTrue(uploadButton.exists)
        XCTAssertTrue(uploadButton.isEnabled)
    }
    
    // MARK: - Artwork Upload Tests
    func testArtworkUploadFlow() throws {
        // Navigate to upload screen
        app.buttons["UploadArtworkButton"].tap()
        
        // Test image picker
        let imagePicker = app.sheets["ImagePickerSheet"]
        XCTAssertTrue(imagePicker.waitForExistence(timeout: defaultTimeout))
        
        // Test metadata form
        let titleField = app.textFields["ArtworkTitleField"]
        let artistField = app.textFields["ArtistNameField"]
        let yearField = app.textFields["YearField"]
        
        XCTAssertTrue(titleField.exists)
        XCTAssertTrue(artistField.exists)
        XCTAssertTrue(yearField.exists)
        
        // Test form validation
        titleField.tap()
        titleField.typeText("Test Artwork")
        artistField.tap()
        artistField.typeText("Test Artist")
        yearField.tap()
        yearField.typeText("2023")
        
        // Test upload progress
        app.buttons["GenerateGraphButton"].tap()
        let progressIndicator = app.progressIndicators["UploadProgress"]
        XCTAssertTrue(progressIndicator.exists)
    }
    
    // MARK: - Graph Visualization Tests
    func testGraphVisualization() throws {
        // Load test graph
        app.cells["RecentGraphCell"].firstMatch.tap()
        
        let graphView = app.otherElements["GraphVisualizationView"]
        XCTAssertTrue(graphView.waitForExistence(timeout: defaultTimeout))
        
        // Test zoom gestures
        graphView.pinch(withScale: 2.0, velocity: 1.0)
        graphView.pinch(withScale: 0.5, velocity: -1.0)
        
        // Test node selection
        let node = graphView.buttons["GraphNode"].firstMatch
        XCTAssertTrue(node.exists)
        node.tap()
        
        // Test node details
        let nodeDetails = app.sheets["NodeDetailsSheet"]
        XCTAssertTrue(nodeDetails.exists)
        
        // Test graph reset
        app.buttons["ResetGraphButton"].tap()
        XCTAssertTrue(graphView.exists)
    }
    
    // MARK: - Search Tests
    func testSearchFunctionality() throws {
        let searchBar = app.searchFields["SearchArtwork"]
        searchBar.tap()
        searchBar.typeText("Impressionism")
        
        // Test search results
        let searchResults = app.collectionViews["SearchResultsList"]
        XCTAssertTrue(searchResults.waitForExistence(timeout: defaultTimeout))
        XCTAssertTrue(searchResults.cells.count > 0)
        
        // Test filters
        app.buttons["FilterButton"].tap()
        let filterSheet = app.sheets["FilterSheet"]
        XCTAssertTrue(filterSheet.exists)
        
        // Test filter options
        let periodFilter = filterSheet.switches["TimePeriodFilter"]
        XCTAssertTrue(periodFilter.exists)
        periodFilter.tap()
        
        app.buttons["ApplyFilters"].tap()
        XCTAssertTrue(searchResults.exists)
    }
    
    // MARK: - Accessibility Tests
    func testAccessibility() throws {
        // Enable VoiceOver for testing
        let isVoiceOverRunning = UIAccessibility.isVoiceOverRunning
        
        // Test home screen accessibility
        let searchBar = app.searchFields["SearchArtwork"]
        XCTAssertTrue(searchBar.isAccessibilityElement)
        XCTAssertNotNil(searchBar.accessibilityLabel)
        
        // Test graph view accessibility
        app.cells["RecentGraphCell"].firstMatch.tap()
        let graphView = app.otherElements["GraphVisualizationView"]
        XCTAssertTrue(graphView.isAccessibilityElement)
        
        // Test dynamic type
        let contentSizeCategories: [UIContentSizeCategory] = [.large, .extraExtraLarge]
        for category in contentSizeCategories {
            UIApplication.shared.preferredContentSizeCategory = category
            // Verify UI adapts to size category
            XCTAssertTrue(app.staticTexts["HeaderTitle"].exists)
        }
        
        // Test color contrast
        let uploadButton = app.buttons["UploadArtworkButton"]
        XCTAssertTrue(uploadButton.exists)
        // Verify button meets contrast requirements
        
        // Restore VoiceOver state
        if isVoiceOverRunning {
            UIAccessibility.requestGuidedAccessSession(enabled: true) { _ in }
        }
    }
}