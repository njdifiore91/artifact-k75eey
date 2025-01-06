import logging
import json
from typing import Dict, Any, Optional
from datetime import datetime
from logging.handlers import RotatingFileHandler
import uuid
import os
import socket
from shared.config.settings import Settings

# Constants for logging configuration
DEFAULT_LOG_FORMAT = '{"timestamp": "%(asctime)s.%(msecs)03d", "level": "%(levelname)s", "correlation_id": "%(correlation_id)s", "environment": "%(environment)s", "message": "%(message)s", "module": "%(module)s", "metrics": %(metrics)s}'
DEFAULT_LOG_LEVEL = "INFO"
DEFAULT_DATE_FORMAT = "%Y-%m-%d %H:%M:%S"
SENSITIVE_PATTERNS = {
    "email": "***@***.***",
    "password": "*****",
    "token": "****",
    "api_key": "****",
    "secret": "****",
    "auth": "****"
}

class JsonFormatter(logging.Formatter):
    """Enhanced JSON formatter with security features and ELK Stack integration."""
    
    def __init__(self, default_fields: Optional[Dict[str, Any]] = None, 
                 sensitive_patterns: Optional[Dict[str, str]] = None):
        super().__init__()
        self.default_fields = default_fields or {
            "hostname": socket.gethostname(),
            "environment": os.getenv("ENVIRONMENT", "development"),
            "service": "art_knowledge_graph",
            "version": os.getenv("APP_VERSION", "1.0.0")
        }
        self.sensitive_patterns = sensitive_patterns or SENSITIVE_PATTERNS
        self.correlation_id_field = "correlation_id"

    def format(self, record: logging.LogRecord) -> str:
        """Format log record as secure JSON with sensitive data masking."""
        # Extract base log record data
        log_data = {
            "timestamp": self.formatTime(record, DEFAULT_DATE_FORMAT),
            "level": record.levelname,
            "logger": record.name,
            "module": record.module,
            "line": record.lineno,
            "message": self._mask_sensitive_data(record.getMessage()),
            "correlation_id": getattr(record, self.correlation_id_field, str(uuid.uuid4())),
        }

        # Add system metrics
        log_data["metrics"] = {
            "process_id": record.process,
            "thread_id": record.thread,
            "memory_usage": self._get_memory_usage()
        }

        # Add default fields
        log_data.update(self.default_fields)

        # Add exception info if present
        if record.exc_info:
            log_data["exception"] = self.formatException(record.exc_info)

        # Add ELK Stack specific fields
        log_data["@timestamp"] = datetime.utcnow().isoformat()
        log_data["@version"] = "1"

        return json.dumps(log_data, default=str)

    def _mask_sensitive_data(self, message: str) -> str:
        """Mask sensitive data in log messages."""
        masked_message = message
        for pattern, mask in self.sensitive_patterns.items():
            # Use case-insensitive pattern matching
            pattern_regex = f'(?i){pattern}["\']?\\s*[:=]\\s*["\']?[^"\',\\s]+'
            masked_message = masked_message.replace(pattern_regex, f'{pattern}={mask}')
        return masked_message

    def _get_memory_usage(self) -> Dict[str, float]:
        """Get current process memory usage."""
        try:
            import psutil
            process = psutil.Process(os.getpid())
            return {
                "rss": process.memory_info().rss / 1024 / 1024,  # MB
                "vms": process.memory_info().vms / 1024 / 1024   # MB
            }
        except ImportError:
            return {"rss": 0, "vms": 0}

class LogConfig:
    """Advanced logging configuration manager with ELK Stack integration."""
    
    def __init__(self, settings: Settings):
        self.config = {
            "version": 1,
            "disable_existing_loggers": False,
            "formatters": {
                "json": {
                    "()": JsonFormatter,
                    "default_fields": {
                        "environment": settings.environment,
                        "application": settings.app_name
                    }
                }
            },
            "handlers": {
                "console": {
                    "class": "logging.StreamHandler",
                    "formatter": "json",
                    "stream": "ext://sys.stdout"
                },
                "file": {
                    "class": "logging.handlers.RotatingFileHandler",
                    "formatter": "json",
                    "filename": "logs/app.log",
                    "maxBytes": 10485760,  # 10MB
                    "backupCount": 5,
                    "encoding": "utf8"
                },
                "security": {
                    "class": "logging.handlers.RotatingFileHandler",
                    "formatter": "json",
                    "filename": "logs/security.log",
                    "maxBytes": 10485760,  # 10MB
                    "backupCount": 10,
                    "encoding": "utf8"
                }
            },
            "loggers": {
                "": {  # Root logger
                    "handlers": ["console", "file"],
                    "level": settings.log_level,
                    "propagate": True
                },
                "security": {
                    "handlers": ["security"],
                    "level": "INFO",
                    "propagate": False
                }
            }
        }

        # Configure ELK Stack integration if in production
        if settings.environment == "production":
            self._configure_elk_stack()

    def _configure_elk_stack(self):
        """Configure ELK Stack integration for production environment."""
        try:
            from cmreslogging.handlers import CMRESHandler
            
            self.config["handlers"]["elasticsearch"] = {
                "class": "cmreslogging.handlers.CMRESHandler",
                "hosts": [{"host": os.getenv("ELASTICSEARCH_HOST", "localhost"), 
                          "port": int(os.getenv("ELASTICSEARCH_PORT", 9200))}],
                "auth_type": CMRESHandler.AuthType.BASIC_AUTH,
                "auth_details": (
                    os.getenv("ELASTICSEARCH_USER", "elastic"),
                    os.getenv("ELASTICSEARCH_PASSWORD", "")
                ),
                "es_index_name": "art-knowledge-graph-logs",
                "es_additional_fields": {
                    "environment": os.getenv("ENVIRONMENT", "production")
                }
            }
            
            # Add elasticsearch handler to root logger
            self.config["loggers"][""]["handlers"].append("elasticsearch")
        except ImportError:
            logging.warning("Elasticsearch handler not available. ELK Stack integration disabled.")

    def configure(self):
        """Apply comprehensive logging configuration."""
        # Create log directories if they don't exist
        os.makedirs("logs", exist_ok=True)
        
        # Apply configuration
        logging.config.dictConfig(self.config)

def setup_logging(settings: Settings) -> None:
    """Set up secure logging with comprehensive monitoring capabilities."""
    log_config = LogConfig(settings)
    log_config.configure()
    
    # Set default logging level
    logging.getLogger().setLevel(settings.log_level)
    
    # Log startup message
    logging.info(
        "Logging system initialized",
        extra={
            "correlation_id": str(uuid.uuid4()),
            "environment": settings.environment,
            "metrics": {"startup_time": datetime.utcnow().isoformat()}
        }
    )

def get_logger(name: str) -> logging.Logger:
    """Returns a configured logger instance with security and monitoring features."""
    logger = logging.getLogger(name)
    
    # Add correlation ID filter if not present
    if not any(isinstance(f, logging.Filter) for f in logger.filters):
        class CorrelationIdFilter(logging.Filter):
            def filter(self, record):
                if not hasattr(record, 'correlation_id'):
                    record.correlation_id = str(uuid.uuid4())
                return True
        
        logger.addFilter(CorrelationIdFilter())
    
    return logger