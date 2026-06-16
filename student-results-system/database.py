import os
import sqlite3

DB_FILE = 'results.db'

def get_db_connection():
    """
    Returns a database connection. Automatically switches between MySQL and SQLite
    based on environment variables.
    """
    db_type = os.environ.get('DB_TYPE', 'sqlite').lower()
    
    if db_type == 'mysql':
        # To use MySQL: pip install pymysql
        import pymysql
        return pymysql.connect(
            host=os.environ.get('DB_HOST', 'localhost'),
            user=os.environ.get('DB_USER', 'root'),
            password=os.environ.get('DB_PASSWORD', ''),
            database=os.environ.get('DB_NAME', 'student_results'),
            cursorclass=pymysql.cursors.DictCursor
        )
    else:
        # Default to SQLite
        conn = sqlite3.connect(os.path.join(os.path.dirname(__file__), DB_FILE))
        conn.row_factory = sqlite3.Row
        return conn

def init_db():
    """
    Creates tables and seeds sample data.
    """
    db_type = os.environ.get('DB_TYPE', 'sqlite').lower()
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # SQLite schema creation
    if db_type != 'mysql':
        # Create users table
        cursor.execute('''
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            role TEXT CHECK(role IN ('student', 'faculty')) NOT NULL
        )
        ''')
        
        # Create students table
        cursor.execute('''
        CREATE TABLE IF NOT EXISTS students (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            roll_number TEXT UNIQUE NOT NULL,
            name TEXT NOT NULL,
            department TEXT NOT NULL,
            semester TEXT NOT NULL,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )
        ''')
        
        # Create subjects table
        cursor.execute('''
        CREATE TABLE IF NOT EXISTS subjects (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            code TEXT UNIQUE NOT NULL,
            name TEXT NOT NULL
        )
        ''')
        
        # Create marks table
        cursor.execute('''
        CREATE TABLE IF NOT EXISTS marks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            student_id INTEGER,
            subject_id INTEGER,
            marks_obtained INTEGER NOT NULL,
            max_marks INTEGER DEFAULT 100,
            FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
            FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE,
            UNIQUE(student_id, subject_id)
        )
        ''')
        conn.commit()
        
    # Seed Sample Data if tables are empty
    # Check if we already have users
    cursor.execute("SELECT COUNT(*) FROM users")
    count = cursor.fetchone()
    count_val = count[0] if isinstance(count, tuple) else count['COUNT(*)'] if isinstance(count, dict) else count[0]
    
    if count_val == 0:
        # 1. Add Users
        users_data = [
            ('faculty@school.edu', 'admin123', 'faculty'),
            ('student1@school.edu', 'password123', 'student'),
            ('student2@school.edu', 'password123', 'student'),
            ('student3@school.edu', 'password123', 'student')
        ]
        
        for email, pwd, role in users_data:
            cursor.execute("INSERT INTO users (email, password, role) VALUES (?, ?, ?)", (email, pwd, role))
        
        # Fetch inserted user IDs
        cursor.execute("SELECT id, email FROM users")
        users_map = {row[1] if isinstance(row, tuple) else row['email']: row[0] if isinstance(row, tuple) else row['id'] for row in cursor.fetchall()}
        
        # 2. Add Students
        students_data = [
            (users_map['student1@school.edu'], '2026CS001', 'Alice Vance', 'Computer Science', '6th Semester'),
            (users_map['student2@school.edu'], '2026CS002', 'Bob Miller', 'Information Technology', '6th Semester'),
            (users_map['student3@school.edu'], '2026EE054', 'Charlie Davis', 'Electrical Engineering', '4th Semester')
        ]
        
        for u_id, roll, name, dept, sem in students_data:
            cursor.execute("INSERT INTO students (user_id, roll_number, name, department, semester) VALUES (?, ?, ?, ?, ?)", 
                           (u_id, roll, name, dept, sem))
            
        # 3. Add Subjects
        subjects_data = [
            ('CS-301', 'Database Management Systems'),
            ('CS-302', 'Software Engineering'),
            ('CS-303', 'Artificial Intelligence'),
            ('CS-304', 'Computer Networks')
        ]
        for code, name in subjects_data:
            cursor.execute("INSERT INTO subjects (code, name) VALUES (?, ?)", (code, name))
            
        # Fetch IDs
        cursor.execute("SELECT id FROM students")
        student_ids = [r[0] if isinstance(r, tuple) else r['id'] for r in cursor.fetchall()]
        
        cursor.execute("SELECT id FROM subjects")
        subject_ids = [r[0] if isinstance(r, tuple) else r['id'] for r in cursor.fetchall()]
        
        # 4. Seed Marks
        # Student 1 marks
        s1_marks = [(student_ids[0], subject_ids[0], 85), (student_ids[0], subject_ids[1], 90), 
                    (student_ids[0], subject_ids[2], 78), (student_ids[0], subject_ids[3], 88)]
        # Student 2 marks
        s2_marks = [(student_ids[1], subject_ids[0], 72), (student_ids[1], subject_ids[1], 80), 
                    (student_ids[1], subject_ids[2], 85), (student_ids[1], subject_ids[3], 65)]
        # Student 3 marks (partial)
        s3_marks = [(student_ids[2], subject_ids[0], 95), (student_ids[2], subject_ids[1], 88)]
        
        all_marks = s1_marks + s2_marks + s3_marks
        for s_id, sub_id, score in all_marks:
            cursor.execute("INSERT INTO marks (student_id, subject_id, marks_obtained, max_marks) VALUES (?, ?, ?, 100)", 
                           (s_id, sub_id, score))
            
        conn.commit()
        print("Database initialized and seeded successfully.")
        
    conn.close()

if __name__ == '__main__':
    # Initialize SQLite locally
    init_db()
