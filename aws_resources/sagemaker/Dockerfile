# SageMaker YOLOv11-nano Inference Container
# Based on Python 3.10 with CUDA support for GPU inference

FROM nvidia/cuda:11.8.0-cudnn8-runtime-ubuntu22.04

# Set environment variables
ENV PYTHONUNBUFFERED=1 \
    DEBIAN_FRONTEND=noninteractive \
    PATH="/opt/program:${PATH}"

# Install system dependencies
RUN apt-get update && apt-get install -y \
    python3.10 \
    python3-pip \
    python3-dev \
    nginx \
    ca-certificates \
    libgl1-mesa-glx \
    libglib2.0-0 \
    wget \
    && rm -rf /var/lib/apt/lists/*

# Set Python 3.10 as default
RUN update-alternatives --install /usr/bin/python python /usr/bin/python3.10 1
RUN update-alternatives --install /usr/bin/pip pip /usr/bin/pip3 1

# Upgrade pip
RUN pip install --upgrade pip

# Set working directory
WORKDIR /opt/program

# Copy requirements and install Python dependencies
COPY requirements.txt /opt/program/
RUN pip install --no-cache-dir -r requirements.txt

# Download YOLOv11-nano model weights (baked into container)
# Using wget to download directly from Ultralytics releases
RUN wget -q https://github.com/ultralytics/assets/releases/download/v8.3.0/yolo11n.pt -O /opt/program/yolo11n.pt

# Verify model file exists and preload to cache
RUN python -c "from ultralytics import YOLO; model = YOLO('/opt/program/yolo11n.pt'); print('Model loaded successfully!')"

# Copy inference code
COPY inference.py /opt/program/
COPY wsgi.py /opt/program/
COPY nginx.conf /etc/nginx/nginx.conf
COPY serve /opt/program/serve

# Make serve script executable
RUN chmod +x /opt/program/serve

# Expose port 8080 for SageMaker
EXPOSE 8080

# Set the entry point to our serve script
ENTRYPOINT ["/opt/program/serve"]
