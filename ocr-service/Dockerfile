FROM python:3.12-slim
# Library sistem yang dibutuhkan OpenCV/PaddleOCR
RUN apt-get update && apt-get install -y --no-install-recommends libgl1 libglib2.0-0 libgomp1 \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY app.py .
ENV PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK=True
EXPOSE 8866
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8866"]
