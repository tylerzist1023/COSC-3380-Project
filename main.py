from flask import Flask, render_template, request, url_for, redirect, session
from jinja2.utils import urlize 
import pymysql
from datetime import datetime,date

def get_conn():
    return pymysql.connect(
        host='35.226.14.71',
        user='coogmusic',
        password='coogs4life!',
        database='coogmusic'
    )  

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

@app.route('/listener/register', methods=['GET'])
def get_listener_register():
    return render_template('register.html', role='listener')

@app.route('/listener/register', methods=['POST'])
def post_listener_register():
    conn = get_conn()
    cursor = conn.cursor()
    query = 'INSERT INTO Listener (Fname, Lname, Email, DOB, Username, Password, Pnumber, ProfilePic, Bio) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s)'
    vals = (request.form['first'], request.form['last'], request.form['email'], request.form['DOB'], request.form['username'], request.form['password'], request.form['pnum'], None, None)

    cursor.execute(query, vals)
    conn.commit()

    conn.close()

    session.clear()
    session['role'] = 'listener'
    session['username'] = request.form['username']
    session['logged_in'] = True

    return redirect(url_for('index'))

@app.route('/listener/login', methods=['GET'])
def get_listener_login():
    return render_template('login.html', role='listener')

@app.route('/listener/login', methods=['POST'])
def post_listener_login():
    conn = get_conn()
    cursor = conn.cursor()
    cursor.execute('select * from Listener where Username=%s and Password=%s', (request.form['username'], request.form['password']))
    user = cursor.fetchone()

    conn.close()

    if user is None:
        return redirect(url_for('get_listener_login'))
    else:
        session.clear()
        session['role'] = 'listener'
        session['logged_in'] = True
        session['username'] = request.form['username']
        return redirect(url_for('index'))

@app.route('/listener/logout')
def listener_logout():
    session.clear()
    return redirect(url_for('index'))

@app.route('/artist/register', methods=['GET'])
def get_artist_register():
    return render_template('register.html', role='artist')

@app.route('/artist/register', methods=['POST'])
def post_artist_register():
    conn = get_conn()
    cursor = conn.cursor()
    query = 'INSERT INTO Artist (ArtistName, Email, DOB, UserName, Password, Pnumber, ProfilePic, Bio) VALUES (%s,%s,%s,%s,%s,%s,%s,%s)'
    vals = (request.form['name'], request.form['email'], request.form['DOB'], request.form['username'], request.form['password'], request.form['pnum'], None, None)

    cursor.execute(query, vals)
    conn.commit()

    conn.close()

    session.clear()
    session['role'] = 'artist'
    session['username'] = request.form['username']
    session['logged_in'] = True

    return redirect(url_for('index'))

@app.route('/artist/login', methods=['GET'])
def get_artist_login():
    return render_template('login.html', role='artist')

@app.route('/artist/login', methods=['POST'])
def post_artist_login():
    conn = get_conn()
    cursor = conn.cursor()
    cursor.execute('select * from Artist where UserName=%s and Password=%s', (request.form['username'], request.form['password']))
    user = cursor.fetchone()

    conn.close()

    if user is None:
        return redirect(url_for('get_artist_login'))
    else:
        session.clear()
        session['role'] = 'artist'
        session['logged_in'] = True
        session['username'] = request.form['username']
        return redirect(url_for('index'))

@app.route('/artist/logout')
def artist_logout():
    session.clear()
    return redirect(url_for('index'))

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=80)