# Use a lightweight Python base image
FROM python:3.14-slim
LABEL authors="arpithkumardubey"

# Set the working directory inside the container
WORKDIR /app

# Copy dependencies first to leverage Docker layer caching
COPY requirements.txt .

# Install dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Copy the rest of the application code
COPY . .

# Expose the port FastAPI runs on
EXPOSE 8000

# Command to run the application
CMD ["uvicorn", "src.api:app", "--host", "0.0.0.0", "--port", "8000"]