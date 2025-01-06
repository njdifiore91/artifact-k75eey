"""
Main entry point for the Art Knowledge Graph data processor service, orchestrating artwork
analysis, metadata extraction, and integration with external art databases with comprehensive
monitoring and security features.
"""

import asyncio
import logging
from typing import Dict, Any, Optional
from datetime import datetime, timezone
import structlog
from prometheus_client import Counter, Histogram, Gauge
from fastapi import FastAPI, File, UploadFile, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware
from opentelemetry import trace
from circuit_breaker import circuit_breaker

from data_processor.config import DataProcessorSettings
from data_processor.services.getty import GettyAPIClient
from shared.utils.cache import CacheManager
from shared.middleware.error_handler import setup_error_handler
from shared.utils.validation import validate_image, validate_artwork_metadata
from shared.logging.config import get_logger
from shared.schemas.error import ErrorResponse

# Initialize tracer
tracer = trace.get_tracer(__name__)

# Prometheus metrics
PROCESSING_TIME = Histogram(
    'artwork_processing_duration_seconds',
    'Time spent processing artwork',
    ['status']
)
PROCESSING_ERRORS = Counter(
    'artwork_processing_errors_total',
    'Total number of artwork processing errors',
    ['error_type']
)
API_HEALTH = Gauge(
    'api_health_status',
    'Health status of external APIs',
    ['api_name']
)

class DataProcessor:
    """
    Main service class for processing artwork data and managing integrations with
    comprehensive monitoring and security features.
    """

    def __init__(self, settings: DataProcessorSettings):
        """Initialize data processor with secure configuration."""
        self._settings = settings
        self._logger = get_logger(__name__)
        
        # Initialize cache manager
        self._cache = CacheManager(settings)
        
        # Initialize API clients with security controls
        self._getty_client = GettyAPIClient(settings, self._cache)
        
        # Configure monitoring
        self._setup_monitoring()

    @circuit_breaker(failure_threshold=3, recovery_timeout=30)
    async def process_artwork(
        self,
        image_data: bytes,
        content_type: str,
        correlation_id: str
    ) -> Dict[str, Any]:
        """
        Process artwork image and extract comprehensive metadata with error handling
        and monitoring.
        """
        start_time = datetime.now(timezone.utc)
        
        with tracer.start_as_current_span("process_artwork") as span:
            span.set_attribute("correlation_id", correlation_id)
            
            try:
                # Validate image with security checks
                is_valid, validation_metadata = await validate_image(
                    image_data,
                    content_type
                )
                
                if not is_valid:
                    raise ValueError("Invalid image data")
                
                # Process image and extract metadata in parallel
                async with asyncio.TaskGroup() as tg:
                    metadata_task = tg.create_task(
                        self._getty_client.get_artwork_metadata(image_data)
                    )
                    style_task = tg.create_task(
                        self._getty_client.get_style_classification(image_data)
                    )
                
                metadata = metadata_task.result()
                style_classification = style_task.result()
                
                # Combine and validate results
                processed_data = {
                    "metadata": metadata,
                    "style": style_classification,
                    "validation": validation_metadata,
                    "processing_time": (datetime.now(timezone.utc) - start_time).total_seconds()
                }
                
                # Record successful processing
                PROCESSING_TIME.labels(status="success").observe(
                    processed_data["processing_time"]
                )
                
                return processed_data
                
            except Exception as e:
                # Record processing error
                PROCESSING_ERRORS.labels(
                    error_type=type(e).__name__
                ).inc()
                
                self._logger.error(
                    "Artwork processing failed",
                    error=str(e),
                    correlation_id=correlation_id,
                    exc_info=True
                )
                
                raise

    async def health_check(self) -> Dict[str, Any]:
        """Perform comprehensive health check of all components."""
        health_status = {
            "status": "healthy",
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "components": {}
        }
        
        try:
            # Check Getty API
            getty_status = await self._check_api_health("getty")
            health_status["components"]["getty_api"] = getty_status
            API_HEALTH.labels(api_name="getty").set(1 if getty_status["healthy"] else 0)
            
            # Check cache
            cache_status = await self._cache.health_check()
            health_status["components"]["cache"] = cache_status
            
            # Update overall status
            if not all(comp["healthy"] for comp in health_status["components"].values()):
                health_status["status"] = "degraded"
                
        except Exception as e:
            health_status["status"] = "unhealthy"
            health_status["error"] = str(e)
            
        return health_status

    def _setup_monitoring(self) -> None:
        """Configure monitoring and alerting."""
        structlog.configure(
            processors=[
                structlog.processors.TimeStamper(fmt="iso"),
                structlog.processors.StackInfoRenderer(),
                structlog.processors.format_exc_info,
                structlog.processors.JSONRenderer()
            ],
            context_class=dict,
            logger_factory=structlog.PrintLoggerFactory(),
            wrapper_class=structlog.BoundLogger,
            cache_logger_on_first_use=True,
        )

    async def _check_api_health(self, api_name: str) -> Dict[str, Any]:
        """Check health of external API."""
        try:
            if api_name == "getty":
                await self._getty_client.health_check()
            return {"healthy": True}
        except Exception as e:
            return {
                "healthy": False,
                "error": str(e)
            }

def create_app() -> FastAPI:
    """Creates and configures the FastAPI application with middleware and monitoring."""
    settings = DataProcessorSettings()
    app = FastAPI(
        title="Art Knowledge Graph Data Processor",
        version="1.0.0",
        docs_url="/api/docs" if settings.environment != "production" else None
    )
    
    # Configure CORS
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.allowed_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"]
    )
    
    # Configure error handling
    error_handler = setup_error_handler(app)
    app.add_middleware(BaseHTTPMiddleware, dispatch=error_handler)
    
    # Initialize data processor
    processor = DataProcessor(settings)
    
    @app.post("/api/v1/process")
    async def process_artwork(
        file: UploadFile = File(...),
        background_tasks: BackgroundTasks = None
    ):
        """Process artwork endpoint with security and monitoring."""
        correlation_id = str(uuid.uuid4())
        
        try:
            image_data = await file.read()
            result = await processor.process_artwork(
                image_data,
                file.content_type,
                correlation_id
            )
            
            # Schedule background cleanup
            if background_tasks:
                background_tasks.add_task(file.file.close)
            
            return result
        except Exception as e:
            raise HTTPException(
                status_code=500,
                detail=str(e)
            )
    
    @app.get("/health")
    async def health_check():
        """Health check endpoint."""
        return await processor.health_check()
    
    @app.get("/metrics")
    async def metrics():
        """Prometheus metrics endpoint."""
        return Response(
            media_type="text/plain",
            content=generate_latest()
        )
    
    return app

app = create_app()

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        reload=True if DataProcessorSettings().environment != "production" else False
    )