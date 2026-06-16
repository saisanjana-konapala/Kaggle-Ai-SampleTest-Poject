import os
from flask import Flask, jsonify, render_template, request, session, redirect, url_for
from database import get_db_connection, init_db
import s3_backup

app = Flask(__name__)
app.secret_key = 'super_secret_student_results_system_key'

# Ensure database is initialized
init_db()

@app.route('/')
def index():
    if 'user_id' in session:
        if session['role'] == 'student':
            return redirect(url_for('student_dashboard'))
        elif session['role'] == 'faculty':
            return redirect(url_for('faculty_dashboard'))
    return redirect(url_for('login'))

@app.route('/login', methods=['GET', 'POST'])
def login():
    if request.method == 'POST':
        email = request.form.get('email', '').strip()
        password = request.form.get('password', '').strip()
        role = request.form.get('role', 'student')
        
        conn = get_db_connection()
        cursor = conn.cursor()
        
        cursor.execute("SELECT * FROM users WHERE email = ? AND password = ? AND role = ?", (email, password, role))
        user = cursor.fetchone()
        
        if user:
            # Convert SQLite Row or PyMySQL Dict to regular dict access
            u_id = user[0] if isinstance(user, tuple) else user['id']
            u_email = user[1] if isinstance(user, tuple) else user['email']
            u_role = user[3] if isinstance(user, tuple) else user['role']
            
            session['user_id'] = u_id
            session['email'] = u_email
            session['role'] = u_role
            
            if u_role == 'student':
                # Get student details
                cursor.execute("SELECT id, name, roll_number FROM students WHERE user_id = ?", (u_id,))
                student = cursor.fetchone()
                if student:
                    session['student_id'] = student[0] if isinstance(student, tuple) else student['id']
                    session['name'] = student[1] if isinstance(student, tuple) else student['name']
                else:
                    session['student_id'] = None
                    session['name'] = "Student User"
            else:
                session['name'] = "Faculty Member"
                
            conn.close()
            return redirect(url_for('student_dashboard' if u_role == 'student' else 'faculty_dashboard'))
            
        conn.close()
        return render_template('login.html', error="Invalid email, password, or role choice.")
        
    return render_template('login.html')

@app.route('/logout')
def logout():
    session.clear()
    return redirect(url_for('login'))

@app.route('/student')
def student_dashboard():
    if 'user_id' not in session or session['role'] != 'student':
        return redirect(url_for('login'))
        
    student_id = session.get('student_id')
    if not student_id:
        return "Student profile details not found.", 404
        
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # 1. Fetch student info
    cursor.execute("SELECT * FROM students WHERE id = ?", (student_id,))
    student_row = cursor.fetchone()
    student_info = dict(student_row) if not isinstance(student_row, tuple) else {
        'id': student_row[0],
        'roll_number': student_row[2],
        'name': student_row[3],
        'department': student_row[4],
        'semester': student_row[5]
    }
    
    # 2. Fetch marks with subject details
    cursor.execute('''
        SELECT s.code, s.name as subject_name, m.marks_obtained, m.max_marks
        FROM marks m
        JOIN subjects s ON m.subject_id = s.id
        WHERE m.student_id = ?
    ''', (student_id,))
    
    marks_rows = cursor.fetchall()
    marks_list = []
    total_obtained = 0
    total_max = 0
    
    for row in marks_rows:
        if isinstance(row, tuple):
            obtained = row[2]
            maximum = row[3]
            code = row[0]
            sub_name = row[1]
        else:
            obtained = row['marks_obtained']
            maximum = row['max_marks']
            code = row['code']
            sub_name = row['subject_name']
            
        percentage = (obtained / maximum) * 100 if maximum > 0 else 0
        
        # Simple grading system
        if percentage >= 90: grade = 'A+'
        elif percentage >= 80: grade = 'A'
        elif percentage >= 70: grade = 'B'
        elif percentage >= 60: grade = 'C'
        elif percentage >= 50: grade = 'D'
        else: grade = 'F'
        
        status = 'Pass' if grade != 'F' else 'Fail'
        
        total_obtained += obtained
        total_max += maximum
        
        marks_list.append({
            'code': code,
            'subject_name': sub_name,
            'marks_obtained': obtained,
            'max_marks': maximum,
            'grade': grade,
            'status': status
        })
        
    avg_percentage = (total_obtained / total_max) * 100 if total_max > 0 else 0
    gpa = (avg_percentage / 10) * 0.4  # Convert to a 4.0 scale roughly
    
    summary = {
        'total_obtained': total_obtained,
        'total_max': total_max,
        'percentage': round(avg_percentage, 1),
        'gpa': round(gpa, 2)
    }
    
    conn.close()
    return render_template('student.html', student=student_info, marks=marks_list, summary=summary)

@app.route('/faculty')
def faculty_dashboard():
    if 'user_id' not in session or session['role'] != 'faculty':
        return redirect(url_for('login'))
        
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # Fetch all subjects for the dropdowns
    cursor.execute("SELECT id, code, name FROM subjects")
    sub_rows = cursor.fetchall()
    subjects = [dict(r) if not isinstance(r, tuple) else {'id': r[0], 'code': r[1], 'name': r[2]} for r in sub_rows]
    
    conn.close()
    return render_template('faculty.html', name=session.get('name'), subjects=subjects)

# ==========================================================================
# REST API FOR FACULTY ACTIONS
# ==========================================================================
@app.route('/api/students')
def get_students():
    if 'user_id' not in session or session['role'] != 'faculty':
        return jsonify({'status': 'error', 'message': 'Unauthorized'}), 403
        
    query = request.args.get('query', '').strip()
    
    conn = get_db_connection()
    cursor = conn.cursor()
    
    if query:
        search_pattern = f"%{query}%"
        cursor.execute('''
            SELECT id, name, roll_number, department, semester 
            FROM students 
            WHERE name LIKE ? OR roll_number LIKE ? OR department LIKE ?
        ''', (search_pattern, search_pattern, search_pattern))
    else:
        cursor.execute("SELECT id, name, roll_number, department, semester FROM students")
        
    rows = cursor.fetchall()
    students = [dict(r) if not isinstance(r, tuple) else {
        'id': r[0],
        'name': r[1],
        'roll_number': r[2],
        'department': r[3],
        'semester': r[4]
    } for r in rows]
    
    conn.close()
    return jsonify({'status': 'success', 'data': students})

@app.route('/api/student/<int:student_id>/marks')
def get_student_marks(student_id):
    if 'user_id' not in session or session['role'] != 'faculty':
        return jsonify({'status': 'error', 'message': 'Unauthorized'}), 403
        
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # Verify student exists
    cursor.execute("SELECT name FROM students WHERE id = ?", (student_id,))
    student = cursor.fetchone()
    if not student:
        conn.close()
        return jsonify({'status': 'error', 'message': 'Student not found'}), 404
        
    student_name = student[0] if isinstance(student, tuple) else student['name']
    
    # Get all subjects and any existing marks for this student
    cursor.execute('''
        SELECT s.id as subject_id, s.code, s.name as subject_name, 
               COALESCE(m.marks_obtained, -1) as marks_obtained,
               COALESCE(m.max_marks, 100) as max_marks
        FROM subjects s
        LEFT JOIN marks m ON s.id = m.subject_id AND m.student_id = ?
    ''', (student_id,))
    
    rows = cursor.fetchall()
    marks = [dict(r) if not isinstance(r, tuple) else {
        'subject_id': r[0],
        'code': r[1],
        'subject_name': r[2],
        'marks_obtained': r[3],
        'max_marks': r[4]
    } for r in rows]
    
    conn.close()
    return jsonify({
        'status': 'success',
        'student_name': student_name,
        'data': marks
    })

@app.route('/api/marks', methods=['POST'])
def save_marks():
    if 'user_id' not in session or session['role'] != 'faculty':
        return jsonify({'status': 'error', 'message': 'Unauthorized'}), 403
        
    data = request.json
    student_id = data.get('student_id')
    subject_id = data.get('subject_id')
    marks_obtained = data.get('marks_obtained')
    
    if student_id is None or subject_id is None or marks_obtained is None:
        return jsonify({'status': 'error', 'message': 'Missing fields'}), 400
        
    try:
        marks_obtained = int(marks_obtained)
        if marks_obtained < 0 or marks_obtained > 100:
            return jsonify({'status': 'error', 'message': 'Marks must be between 0 and 100'}), 400
    except ValueError:
        return jsonify({'status': 'error', 'message': 'Marks must be an integer'}), 400
        
    conn = get_db_connection()
    cursor = conn.cursor()
    
    try:
        # Check if row exists to update, otherwise insert
        cursor.execute("SELECT id FROM marks WHERE student_id = ? AND subject_id = ?", (student_id, subject_id))
        existing = cursor.fetchone()
        
        if existing:
            cursor.execute("UPDATE marks SET marks_obtained = ? WHERE student_id = ? AND subject_id = ?", 
                           (marks_obtained, student_id, subject_id))
        else:
            cursor.execute("INSERT INTO marks (student_id, subject_id, marks_obtained, max_marks) VALUES (?, ?, ?, 100)", 
                           (student_id, subject_id, marks_obtained))
        conn.commit()
        success = True
        message = "Marks updated successfully."
    except Exception as e:
        success = False
        message = str(e)
    finally:
        conn.close()
        
    if success:
        return jsonify({'status': 'success', 'message': message})
    return jsonify({'status': 'error', 'message': message}), 500

@app.route('/api/backup', methods=['POST'])
def trigger_backup():
    if 'user_id' not in session or session['role'] != 'faculty':
        return jsonify({'status': 'error', 'message': 'Unauthorized'}), 403
        
    success, message = s3_backup.run_backup()
    
    if success:
        return jsonify({'status': 'success', 'message': message})
    return jsonify({'status': 'error', 'message': message}), 500

if __name__ == '__main__':
    app.run(host='127.0.0.1', port=5001, debug=True)
