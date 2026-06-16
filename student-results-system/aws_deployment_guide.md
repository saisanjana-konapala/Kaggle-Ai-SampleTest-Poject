# AWS EC2 & S3 Deployment Guide

This guide details the steps to deploy the Student Result Management System on an **AWS EC2** instance, configure the **Nginx** reverse proxy, configure **Systemd** to keep the Flask app running, and set up a **cron job** to automate S3 backups.

---

## ☁️ Part 1: S3 Bucket Setup & AWS Credentials

The application uses the `boto3` library to upload database backups to Amazon S3.

1. **Create an S3 Bucket**:
   - Go to the Amazon S3 Console and click **Create Bucket**.
   - Choose a unique name (e.g. `student-portal-backups-2026`) and select your preferred AWS Region.
   - Keep default settings and block all public access.

2. **Generate IAM User Credentials**:
   - Go to the AWS IAM Console.
   - Create a new IAM User named `student-portal-backup-agent`.
   - Attach a policy granting `s3:PutObject` access on your bucket:
     ```json
     {
         "Version": "2012-10-17",
         "Statement": [
             {
                 "Effect": "Allow",
                 "Action": "s3:PutObject",
                 "Resource": "arn:aws:s3:::YOUR_BUCKET_NAME/backups/*"
             }
         ]
     }
     ```
   - Generate an **Access Key ID** and **Secret Access Key**. Keep these safe.

---

## 🖥️ Part 2: AWS EC2 Instance Deployment

### 1. Launch Instance
- Launch an EC2 Instance using **Ubuntu 24.04 LTS** (t2.micro is eligible for Free Tier).
- In the Security Group, open ports:
  - `22` (SSH)
  - `80` (HTTP)
  - `443` (HTTPS)

### 2. Configure Environment on EC2
SSH into your instance and install the required dependencies:

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Python and Nginx
sudo apt install python3-pip python3-venv nginx -y

# Clone your project repository
git clone https://github.com/saisanjana-konapala/Kaggle-Ai-SampleTest-Poject.git
cd Kaggle-Ai-SampleTest-Poject/student-results-system
```

### 3. Setup Virtual Environment & Dependencies
```bash
# Create venv
python3 -m venv venv
source venv/bin/activate

# Install dependencies
pip install --upgrade pip
pip install flask requests boto3 gunicorn
```

---

## ⚙️ Part 3: Configure Gunicorn & Systemd

To keep your Flask application running in the background and survive server restarts, configure a Systemd service with **Gunicorn**:

1. Create a service description file:
   ```bash
   sudo nano /etc/systemd/system/student-portal.service
   ```

2. Add the following content, replacing variables with your actual paths and credentials:
   ```ini
   [Unit]
   Description=Gunicorn instance to serve Student Result Management System
   After=network.target

   [Service]
   User=ubuntu
   WorkingDirectory=/home/ubuntu/Kaggle-Ai-SampleTest-Poject/student-results-system
   Environment="PATH=/home/ubuntu/Kaggle-Ai-SampleTest-Poject/student-results-system/venv/bin"
   # Database Configuration (Switch to 'mysql' and configure credentials if needed)
   Environment="DB_TYPE=sqlite"
   # AWS Configurations for S3 Backups
   Environment="AWS_ACCESS_KEY_ID=YOUR_AWS_ACCESS_KEY"
   Environment="AWS_SECRET_ACCESS_KEY=YOUR_AWS_SECRET_KEY"
   Environment="AWS_DEFAULT_REGION=us-east-1"
   Environment="S3_BUCKET_NAME=student-portal-backups-2026"
   
   ExecStart=/home/ubuntu/Kaggle-Ai-SampleTest-Poject/student-results-system/venv/bin/gunicorn --workers 3 --bind 127.0.0.1:5001 app:app

   [Install]
   WantedBy=multi-user.target
   ```

3. Start and enable the service:
   ```bash
   sudo systemctl daemon-reload
   sudo systemctl start student-portal
   sudo systemctl enable student-portal
   ```

---

## 🔀 Part 4: Configure Nginx as Reverse Proxy

Nginx receives internet traffic on port 80 and routes it to Gunicorn running locally on port 5001.

1. Open the Nginx default configuration block:
   ```bash
   sudo nano /etc/nginx/sites-available/student-portal
   ```

2. Add the following server configuration:
   ```nginx
   server {
       listen 80;
       server_name your-domain.com or-your-ec2-public-ip;

       location / {
           proxy_pass http://127.0.0.1:5001;
           proxy_set_header Host $host;
           proxy_set_header X-Real-IP $remote_addr;
           proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
           proxy_set_header X-Forwarded-Proto $scheme;
       }

       location /static/ {
           alias /home/ubuntu/Kaggle-Ai-SampleTest-Poject/student-results-system/static/;
       }
   }
   ```

3. Enable the configuration and restart Nginx:
   ```bash
   sudo ln -s /etc/nginx/sites-available/student-portal /etc/nginx/sites-enabled/
   sudo systemctl restart nginx
   # Verify configurations are correct
   sudo nginx -t
   ```

---

## ⏰ Part 5: Automate Database Backups with Cron

To perform automatic nightly backups of your database to AWS S3:

1. Open the crontab editor on your EC2 instance:
   ```bash
   crontab -e
   ```

2. Add a cron job to trigger the backup script every day at midnight (00:00). We specify the environment variables inline:
   ```bash
   0 0 * * * env AWS_ACCESS_KEY_ID="YOUR_ACCESS_KEY" AWS_SECRET_ACCESS_KEY="YOUR_SECRET_KEY" AWS_DEFAULT_REGION="us-east-1" S3_BUCKET_NAME="student-portal-backups-2026" /home/ubuntu/Kaggle-Ai-SampleTest-Poject/student-results-system/venv/bin/python /home/ubuntu/Kaggle-Ai-SampleTest-Poject/student-results-system/s3_backup.py >> /home/ubuntu/backup.log 2>&1
   ```

This configuration ensures your student records database is backed up to S3 every night without any manual action!
