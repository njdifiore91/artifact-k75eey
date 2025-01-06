"""
Art Knowledge Graph Backend
Setup configuration for backend services package.
Requires Python 3.11+
"""

import os
from setuptools import setup, find_packages  # version 67.0.0+
from pkg_resources import parse_requirements  # version 67.0.0+

# Package metadata constants
PACKAGE_NAME = "art-knowledge-graph-backend"
VERSION = "1.0.0"
DESCRIPTION = "Backend services for Art Knowledge Graph mobile application"
AUTHOR = "Art Knowledge Graph Team"
PYTHON_REQUIRES = ">=3.11"

def read_requirements() -> list:
    """
    Reads and validates package requirements from requirements.txt.
    
    Returns:
        List[str]: List of package requirements with version specifications
    
    Raises:
        FileNotFoundError: If requirements.txt is missing
        ValueError: If requirement format is invalid
    """
    requirements = []
    try:
        requirements_path = os.path.join(os.path.dirname(__file__), "requirements.txt")
        with open(requirements_path, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                # Skip comments and empty lines
                if line and not line.startswith("#"):
                    # Validate requirement format
                    try:
                        next(parse_requirements([line]))
                        requirements.append(line)
                    except Exception as e:
                        raise ValueError(f"Invalid requirement format: {line}") from e
    except FileNotFoundError:
        raise FileNotFoundError(
            "requirements.txt not found. Please ensure it exists in the package root."
        )
    return requirements

def get_long_description() -> str:
    """
    Reads the long description from README.md.
    
    Returns:
        str: Content of README.md as markdown formatted string
    
    Raises:
        FileNotFoundError: If README.md is missing
    """
    try:
        readme_path = os.path.join(os.path.dirname(__file__), "README.md")
        with open(readme_path, "r", encoding="utf-8") as f:
            return f.read()
    except FileNotFoundError:
        raise FileNotFoundError(
            "README.md not found. Please ensure it exists in the package root."
        )

setup(
    # Package metadata
    name=PACKAGE_NAME,
    version=VERSION,
    description=DESCRIPTION,
    long_description=get_long_description(),
    long_description_content_type="text/markdown",
    author=AUTHOR,
    author_email="team@artknowledgegraph.com",
    
    # Package configuration
    packages=find_packages(exclude=["tests*", "docs*"]),
    python_requires=PYTHON_REQUIRES,
    install_requires=read_requirements(),
    
    # Package classifiers
    classifiers=[
        "Development Status :: 5 - Production/Stable",
        "Intended Audience :: Developers",
        "License :: OSI Approved :: MIT License",
        "Operating System :: OS Independent",
        f"Programming Language :: Python :: 3.11",
        "Topic :: Software Development :: Libraries :: Python Modules",
        "Topic :: Scientific/Engineering :: Image Processing",
        "Topic :: Database :: Database Engines/Servers",
    ],
    
    # Package URLs
    url="https://github.com/artknowledgegraph/backend",
    project_urls={
        "Bug Tracker": "https://github.com/artknowledgegraph/backend/issues",
        "Documentation": "https://docs.artknowledgegraph.com",
        "Source Code": "https://github.com/artknowledgegraph/backend",
    },
    
    # Entry points for CLI tools
    entry_points={
        "console_scripts": [
            "art-kg-backend=art_knowledge_graph.cli:main",
        ],
    },
    
    # Additional package metadata
    keywords="art knowledge-graph machine-learning image-processing neo4j fastapi",
    platforms=["any"],
    include_package_data=True,
    zip_safe=False,
    
    # Package dependencies for different environments
    extras_require={
        "dev": [
            "pytest>=7.0.0",
            "pytest-cov>=4.0.0",
            "black>=23.0.0",
            "isort>=5.12.0",
            "mypy>=1.0.0",
            "pylint>=2.17.0",
        ],
        "docs": [
            "sphinx>=6.0.0",
            "sphinx-rtd-theme>=1.2.0",
            "sphinx-autodoc-typehints>=1.23.0",
        ],
    },
)