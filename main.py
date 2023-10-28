from flask import Flask, render_template, request, url_for, redirect, session
from jinja2.utils import urlize 
import pymysql
from datetime import datetime,date

conn = pymysql.connect(
        host='35.226.14.71',
        user='coogmusic',
        password='coogs4life!',
        database='coogmusic'
    )
cursor = conn.cursor()

app = Flask(__name__, static_url_path='', static_folder='static/')
app.secret_key = 'the_secret_key'

@app.route('/')
def index():
    name = "sign in"
    role = None
    if 'logged_in' in session and session['logged_in']:
        name = session['username']
        role = session['role']

    return render_template('index.html', name=name, role=role)

@app.route('/login', methods=['GET'])
def get_login():
    role = request.args.get('role')

    if role is None or role == 'listener':
        return render_template('login.html', role='listener')
    elif role == 'artist':
        return render_template('login.html', role='artist')
    return "Not found"

@app.route('/register', methods=['GET'])
def get_register():
    role = request.args.get('role')

    if role is None or role == 'listener':
        return render_template('register.html', role='listener')
    elif role == 'artist':
        return render_template('register.html', role='artist')
    return "Not found"

@app.route('/logout')
def logout():
    session.clear()
    return redirect(url_for('index'))

@app.route('/login', methods=['POST'])
def post_login():
    query = None
    vals = None
    role = request.args.get('role')

    if role is None or role == 'listener':
        query = 'select * from Listener where Username=%s and Password=%s'
        vals = (request.form['username'], request.form['password'])
    elif role == 'artist':
        query = 'select * from Artist where Username=%s and Password=%s'
        vals = (request.form['username'], request.form['password'])
    else:
        return redirect(url_for('get_login', role=[role]))

    cursor.execute(query, vals)
    user = cursor.fetchone()

    if user is None:
        return redirect(url_for('get_login', role=[role]))
    else:
        session.clear()
        session['role'] = role
        session['logged_in'] = True
        session['username'] = request.form['username']
        return redirect(url_for('index'))

@app.route('/register', methods=['POST'])
def post_register():
    query = None
    vals = None
    role = request.args.get('role')

    if role is None or role == 'listener':
        query = 'INSERT INTO Listener (Fname, Lname, Email, DOB, Username, Password, Pnumber, ProfilePic, Bio) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s)'
        vals = (request.form['first'], request.form['last'], request.form['email'], request.form['DOB'], request.form['username'], request.form['password'], request.form['pnum'], None, None)
    elif role == 'artist':
        query = 'INSERT INTO Artist (ArtistName, Email, DOB, UserName, Password, Pnumber, ProfilePic, Bio) VALUES (%s,%s,%s,%s,%s,%s,%s,%s)'
        vals = (request.form['name'], request.form['email'], request.form['DOB'], request.form['username'], request.form['password'], request.form['pnum'], None, None)
    else:
        return redirect(url_for('get_register', role=[role]))

    cursor.execute(query, vals)
    conn.commit()

    session.clear()
    session['role'] = role
    session['username'] = request.form['username']
    session['logged_in'] = True

    return redirect(url_for('index'))

if __name__ == '__main__':
    try:
        app.jinja_env.trim_blocks = True
        app.jinja_env.lstrip_blocks = True
        app.run(debug=True, host='0.0.0.0', port=80)
        conn.close()
    except:
        conn.close()