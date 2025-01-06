"""
Advanced image processing utility module providing ML-based feature extraction,
optimization, and caching capabilities for artwork analysis in the Art Knowledge
Graph system.
"""

import os
from typing import Dict, Any, Optional, Tuple
from datetime import datetime
import logging
from functools import wraps
import asyncio

import numpy as np
from PIL import Image, ImageOps, ExifTags
import tensorflow as tf
from tensorflow.keras.applications import ResNet50
from tensorflow.keras.applications.resnet50 import preprocess_input

from shared.utils.validation import validate_image
from shared.utils.cache import CacheManager
from shared.schemas.error import ValidationError

# Constants for image processing
ALLOWED_IMAGE_FORMATS = ['JPEG', 'PNG', 'WEBP']
MAX_IMAGE_SIZE = 10 * 1024 * 1024  # 10MB
TARGET_RESOLUTION = (800, 800)
IMAGE_CACHE_TTL = 3600  # 1 hour
FEATURE_VECTOR_SIZE = 2048
MODEL_PATH = 'models/feature_extractor.h5'

# Initialize logger
logger = logging.getLogger(__name__)

def performance_monitor(func):
    """Decorator for monitoring function performance."""
    @wraps(func)
    async def wrapper(*args, **kwargs):
        start_time = datetime.now()
        try:
            result = await func(*args, **kwargs)
            duration = (datetime.now() - start_time).total_seconds()
            logger.info(
                f"Function {func.__name__} completed",
                extra={
                    "duration": duration,
                    "success": True
                }
            )
            return result
        except Exception as e:
            duration = (datetime.now() - start_time).total_seconds()
            logger.error(
                f"Function {func.__name__} failed",
                extra={
                    "duration": duration,
                    "error": str(e),
                    "success": False
                }
            )
            raise
    return wrapper

class ImageProcessor:
    """Advanced image processing class with ML capabilities and caching."""
    
    def __init__(self, cache_manager: CacheManager, config: Dict[str, Any]):
        """Initialize processor with ML model and cache."""
        self._cache_manager = cache_manager
        self._config = config
        self._logger = logging.getLogger(__name__)
        
        # Initialize feature extractor model
        self._feature_extractor = self._load_model()
        
        # Configure GPU if available
        self._setup_gpu()

    def _load_model(self) -> tf.keras.Model:
        """Load and configure the feature extraction model."""
        try:
            if os.path.exists(MODEL_PATH):
                model = tf.keras.models.load_model(MODEL_PATH)
            else:
                # Initialize ResNet50 for feature extraction
                model = ResNet50(
                    weights='imagenet',
                    include_top=False,
                    pooling='avg'
                )
                model.save(MODEL_PATH)
            return model
        except Exception as e:
            self._logger.error(f"Failed to load feature extraction model: {str(e)}")
            raise

    def _setup_gpu(self) -> None:
        """Configure GPU settings for TensorFlow."""
        try:
            gpus = tf.config.list_physical_devices('GPU')
            if gpus:
                for gpu in gpus:
                    tf.config.experimental.set_memory_growth(gpu, True)
        except Exception as e:
            self._logger.warning(f"GPU configuration failed: {str(e)}")

    @performance_monitor
    async def process(self, image_data: bytes, content_type: str,
                     options: Dict[str, Any]) -> Dict[str, Any]:
        """Main processing pipeline with ML and caching."""
        try:
            # Validate input
            is_valid, metadata = await validate_image(image_data, content_type)
            if not is_valid:
                raise ValidationError(
                    message="Invalid image data",
                    errors=[{"field": "image", "message": "Validation failed"}]
                )

            # Check cache
            cache_key = f"image:{hash(image_data)}"
            cached_result = await self._cache_manager.get_cached_data(cache_key)
            if cached_result:
                return cached_result

            # Process image
            image = Image.open(BytesIO(image_data))
            
            # Extract EXIF data
            exif_data = self._extract_exif(image)
            
            # Optimize image
            optimized_image = await self._optimize_image(image, options)
            
            # Extract features
            features = await self._extract_features(image)
            
            # Prepare result
            result = {
                "metadata": metadata,
                "exif": exif_data,
                "features": features.tolist(),
                "optimized_size": len(optimized_image),
                "processed_at": datetime.utcnow().isoformat()
            }

            # Cache result
            await self._cache_manager.set_cached_data(cache_key, result, IMAGE_CACHE_TTL)
            
            return result

        except Exception as e:
            self._logger.error(f"Image processing failed: {str(e)}")
            raise

    def _extract_exif(self, image: Image.Image) -> Dict[str, Any]:
        """Extract and process EXIF metadata."""
        try:
            exif = {}
            if hasattr(image, '_getexif') and image._getexif():
                for tag_id, value in image._getexif().items():
                    if tag_id in ExifTags.TAGS:
                        tag_name = ExifTags.TAGS[tag_id]
                        exif[tag_name] = str(value)
            return exif
        except Exception as e:
            self._logger.warning(f"EXIF extraction failed: {str(e)}")
            return {}

    @tf.function
    async def _extract_features(self, image: Image.Image) -> np.ndarray:
        """Extract visual features using pre-trained ML model."""
        try:
            # Prepare image for model
            img_array = tf.keras.preprocessing.image.img_to_array(image)
            img_array = tf.image.resize(img_array, (224, 224))
            img_array = preprocess_input(img_array)
            img_array = tf.expand_dims(img_array, 0)

            # Extract features
            features = self._feature_extractor(img_array)
            
            # Normalize features
            normalized_features = tf.nn.l2_normalize(features, axis=1)
            
            return normalized_features.numpy()

        except Exception as e:
            self._logger.error(f"Feature extraction failed: {str(e)}")
            raise

    async def _optimize_image(self, image: Image.Image, options: Dict[str, Any]) -> bytes:
        """Optimize image with advanced compression and format conversion."""
        try:
            # Resize if needed
            if options.get('resize', True):
                image = ImageOps.contain(image, TARGET_RESOLUTION)

            # Convert color space if needed
            if image.mode not in ('RGB', 'RGBA'):
                image = image.convert('RGB')

            # Optimize based on format
            format_options = {
                'JPEG': {'quality': 85, 'optimize': True},
                'PNG': {'optimize': True},
                'WEBP': {'quality': 85, 'method': 6}
            }

            output_format = options.get('format', 'JPEG').upper()
            if output_format not in ALLOWED_IMAGE_FORMATS:
                output_format = 'JPEG'

            # Save optimized image
            output = BytesIO()
            image.save(output, format=output_format, **format_options[output_format])
            return output.getvalue()

        except Exception as e:
            self._logger.error(f"Image optimization failed: {str(e)}")
            raise

@performance_monitor
async def process_image(image_data: bytes, content_type: str,
                       options: Dict[str, Any]) -> Dict[str, Any]:
    """Process artwork images with ML feature extraction and caching."""
    processor = ImageProcessor(CacheManager(), options)
    return await processor.process(image_data, content_type, options)

@performance_monitor
async def extract_features(image: Image.Image, use_gpu: bool = True) -> np.ndarray:
    """Extract visual features using pre-trained ML model with caching."""
    processor = ImageProcessor(CacheManager(), {'use_gpu': use_gpu})
    return await processor._extract_features(image)

@performance_monitor
async def optimize_image(image: Image.Image, format: str,
                        options: Dict[str, Any]) -> bytes:
    """Optimize image with advanced compression and format conversion."""
    processor = ImageProcessor(CacheManager(), options)
    return await processor._optimize_image(image, {'format': format, **options})