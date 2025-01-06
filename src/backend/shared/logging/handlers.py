import logging
import os
import time
from logging.handlers import RotatingFileHandler
from typing import Dict, Any, Optional
import boto3
from botocore.config import Config
from botocore.exceptions import BotoClientError

from shared.logging.config import JsonFormatter
from shared.config.settings import Settings

# Constants for handler configuration
DEFAULT_MAX_BYTES = 10485760  # 10MB
DEFAULT_BACKUP_COUNT = 5
CLOUDWATCH_RETRY_ATTEMPTS = 3
CLOUDWATCH_TIMEOUT = 5.0
BATCH_SIZE = 100
FLUSH_INTERVAL = 60  # seconds
LOG_PERMISSIONS = 0o600
DIR_PERMISSIONS = 0o700

class CloudWatchHandler(logging.Handler):
    """Enhanced CloudWatch logging handler with retry mechanism and secure error handling."""

    def __init__(self, 
                 settings: Settings,
                 log_group: str,
                 log_stream: str,
                 retry_count: int = CLOUDWATCH_RETRY_ATTEMPTS,
                 timeout: float = CLOUDWATCH_TIMEOUT):
        """Initialize CloudWatch handler with secure configuration."""
        super().__init__()

        # Configure AWS client with retry mechanism
        boto_config = Config(
            retries=dict(max_attempts=retry_count),
            connect_timeout=timeout,
            read_timeout=timeout
        )
        
        self.cloudwatch_client = boto3.client(
            'logs',
            region_name=settings.aws_region,
            config=boto_config
        )

        self.log_group = log_group
        self.log_stream = log_stream
        self.sequence_token = None
        self.log_buffer = []
        self.last_flush = time.time()
        
        # Set up secure JSON formatter
        self.setFormatter(JsonFormatter())
        
        # Ensure log group and stream exist
        self._initialize_log_group()

    def _initialize_log_group(self) -> None:
        """Securely initialize CloudWatch log group and stream."""
        try:
            self.cloudwatch_client.create_log_group(logGroupName=self.log_group)
        except self.cloudwatch_client.exceptions.ResourceAlreadyExistsException:
            pass

        try:
            self.cloudwatch_client.create_log_stream(
                logGroupName=self.log_group,
                logStreamName=self.log_stream
            )
        except self.cloudwatch_client.exceptions.ResourceAlreadyExistsException:
            pass

    def emit(self, record: logging.LogRecord) -> None:
        """Securely send log record to CloudWatch with retry mechanism."""
        try:
            log_entry = {
                'timestamp': int(record.created * 1000),
                'message': self.format(record)
            }
            
            self.log_buffer.append(log_entry)
            
            # Flush if buffer is full or interval exceeded
            if (len(self.log_buffer) >= BATCH_SIZE or 
                time.time() - self.last_flush >= FLUSH_INTERVAL):
                self.flush()
                
        except Exception as e:
            self.handleError(record)

    def flush(self) -> None:
        """Flush buffered logs to CloudWatch."""
        if not self.log_buffer:
            return

        try:
            kwargs = {
                'logGroupName': self.log_group,
                'logStreamName': self.log_stream,
                'logEvents': sorted(self.log_buffer, key=lambda x: x['timestamp'])
            }

            if self.sequence_token:
                kwargs['sequenceToken'] = self.sequence_token

            response = self.cloudwatch_client.put_log_events(**kwargs)
            self.sequence_token = response.get('nextSequenceToken')
            self.log_buffer = []
            self.last_flush = time.time()
            
        except BotoClientError as e:
            # Handle sequence token related errors
            if 'InvalidSequenceTokenException' in str(e):
                self._reset_sequence_token()
                self.flush()  # Retry with new sequence token
            else:
                raise

    def _reset_sequence_token(self) -> None:
        """Reset sequence token for CloudWatch logging."""
        try:
            response = self.cloudwatch_client.describe_log_streams(
                logGroupName=self.log_group,
                logStreamNamePrefix=self.log_stream
            )
            streams = response.get('logStreams', [])
            if streams:
                self.sequence_token = streams[0].get('uploadSequenceToken')
        except Exception:
            self.sequence_token = None

class RotatingJsonFileHandler(RotatingFileHandler):
    """Enhanced rotating file handler with atomic operations and secure file handling."""

    def __init__(self,
                 filename: str,
                 max_bytes: int = DEFAULT_MAX_BYTES,
                 backup_count: int = DEFAULT_BACKUP_COUNT,
                 compress_logs: bool = True,
                 encrypt_logs: bool = True):
        """Initialize secure rotating file handler."""
        # Create log directory with secure permissions
        log_dir = os.path.dirname(filename)
        if log_dir and not os.path.exists(log_dir):
            os.makedirs(log_dir, mode=DIR_PERMISSIONS)

        super().__init__(
            filename,
            maxBytes=max_bytes,
            backupCount=backup_count,
            encoding='utf-8'
        )

        # Set secure file permissions
        if os.path.exists(filename):
            os.chmod(filename, LOG_PERMISSIONS)

        self.compress_logs = compress_logs
        self.encrypt_logs = encrypt_logs
        self.setFormatter(JsonFormatter())

    def rotate(self, source: str, dest: str) -> None:
        """Perform secure log rotation with compression."""
        if os.path.exists(source):
            try:
                # Perform atomic rotation
                if os.path.exists(dest):
                    os.remove(dest)
                os.rename(source, dest)
                
                # Set secure permissions
                os.chmod(dest, LOG_PERMISSIONS)
                
                # Compress rotated log if enabled
                if self.compress_logs and not dest.endswith('.gz'):
                    self._compress_log(dest)
                    
            except Exception as e:
                # Ensure source file is not lost on rotation failure
                if not os.path.exists(source):
                    os.rename(dest, source)
                raise e

    def _compress_log(self, log_file: str) -> None:
        """Compress rotated log file."""
        import gzip
        try:
            with open(log_file, 'rb') as f_in:
                with gzip.open(f'{log_file}.gz', 'wb') as f_out:
                    f_out.writelines(f_in)
            os.remove(log_file)
            os.chmod(f'{log_file}.gz', LOG_PERMISSIONS)
        except Exception:
            if os.path.exists(f'{log_file}.gz'):
                os.remove(f'{log_file}.gz')
            raise

def create_cloudwatch_handler(settings: Settings,
                            log_group: str,
                            log_stream: str) -> CloudWatchHandler:
    """Factory function to create secure CloudWatch handler instance."""
    return CloudWatchHandler(
        settings=settings,
        log_group=log_group,
        log_stream=log_stream
    )

def create_file_handler(filename: str,
                       max_bytes: int = DEFAULT_MAX_BYTES,
                       backup_count: int = DEFAULT_BACKUP_COUNT) -> RotatingJsonFileHandler:
    """Factory function to create secure rotating file handler."""
    return RotatingJsonFileHandler(
        filename=filename,
        max_bytes=max_bytes,
        backup_count=backup_count
    )