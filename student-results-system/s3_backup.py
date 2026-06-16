import os
import shutil
import time
import subprocess

try:
    import boto3
except ImportError:
    boto3 = None

def get_s3_client():
    """
    Creates and returns a boto3 S3 client using environment variables.
    """
    if not boto3:
        raise ImportError("The 'boto3' library is not installed. Run 'pip install boto3' to enable S3 backups.")
        
    access_key = os.environ.get('AWS_ACCESS_KEY_ID')
    secret_key = os.environ.get('AWS_SECRET_ACCESS_KEY')
    region = os.environ.get('AWS_DEFAULT_REGION', 'us-east-1')
    
    if not access_key or not secret_key:
        raise ValueError("AWS credentials not found. Ensure AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY are set.")
        
    return boto3.client(
        's3',
        aws_access_key_id=access_key,
        aws_secret_access_key=secret_key,
        region_name=region
    )

def run_backup():
    """
    Performs a database backup and uploads it to S3.
    Returns: (bool, str) -> (success_status, message)
    """
    db_type = os.environ.get('DB_TYPE', 'sqlite').lower()
    bucket_name = os.environ.get('S3_BUCKET_NAME')
    
    if not bucket_name:
        return False, "S3_BUCKET_NAME environment variable is not configured."
        
    timestamp = time.strftime('%Y%m%d_%H%M%S')
    backup_filename = f"db_backup_{timestamp}"
    
    # 1. Generate local backup file
    local_backup_path = ""
    try:
        if db_type == 'mysql':
            backup_filename += ".sql"
            local_backup_path = os.path.join(os.path.dirname(__file__), backup_filename)
            
            # Run mysqldump
            db_host = os.environ.get('DB_HOST', 'localhost')
            db_user = os.environ.get('DB_USER', 'root')
            db_password = os.environ.get('DB_PASSWORD', '')
            db_name = os.environ.get('DB_NAME', 'student_results')
            
            # Command: mysqldump -h host -u user -ppassword dbname > backup.sql
            cmd = f"mysqldump -h {db_host} -u {db_user} -p{db_password} {db_name} > \"{local_backup_path}\""
            # Run shell command
            subprocess.run(cmd, shell=True, check=True)
        else:
            # SQLite backup: copy results.db
            backup_filename += ".db"
            local_backup_path = os.path.join(os.path.dirname(__file__), backup_filename)
            db_path = os.path.join(os.path.dirname(__file__), 'results.db')
            
            if not os.path.exists(db_path):
                return False, f"Local SQLite database not found at {db_path}"
                
            shutil.copy2(db_path, local_backup_path)
            
        # 2. Upload to S3
        s3 = get_s3_client()
        s3_key = f"backups/{backup_filename}"
        
        s3.upload_file(local_backup_path, bucket_name, s3_key)
        
        return True, f"Backup successfully uploaded to S3: s3://{bucket_name}/{s3_key}"
        
    except ImportError as ie:
        return False, str(ie)
    except ValueError as ve:
        return False, str(ve)
    except Exception as e:
        return False, f"Backup failed: {str(e)}"
    finally:
        # Clean up local temporary backup file
        if local_backup_path and os.path.exists(local_backup_path):
            try:
                os.remove(local_backup_path)
            except Exception:
                pass

if __name__ == '__main__':
    # Test backup locally
    print("Testing backup routine...")
    success, msg = run_backup()
    print(f"Success: {success}")
    print(f"Message: {msg}")
