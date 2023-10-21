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
    name = "sign in!"
    if 'logged_in' in session and session['logged_in']:
        name = session['username']

    return render_template('index.html', name=name)

@app.route('/login', methods=['GET'])
def get_login():
    return render_template('login.html')

@app.route('/login', methods=['POST'])
def post_login():
    conn = get_conn()
    cursor = conn.cursor()
    cursor.execute('select * from Listener where Username=%s and Password=%s', (request.form['username'], request.form['password']))
    user = cursor.fetchone()

    conn.close()

    if user is None:
        return redirect(url_for('get_login'))
    else:
        session['logged_in'] = True
        session['username'] = request.form['username']
        return redirect(url_for('index'))


@app.route('/register', methods=['GET'])
def get_register():
    return render_template('register.html')

@app.route('/register', methods=['POST'])
def post_register():
    conn = get_conn()
    cursor = conn.cursor()
    query = 'INSERT INTO Listener (Fname, Lname, Email, DOB, Username, Password, Pnumber, ProfilePic, Bio, CreationStamp) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)'
    vals = (request.form['first'], request.form['last'], request.form['email'], request.form['DOB'], request.form['username'], request.form['password'], request.form['pnum'], None, None, datetime.now())

    cursor.execute(query, vals)
    conn.commit()

    conn.close()

    return redirect(url_for('index'))

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=80)