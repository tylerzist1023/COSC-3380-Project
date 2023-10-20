from flask import Flask, render_template, request, url_for, redirect
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

@app.route('/')
def index():
    cursor.execute('SELECT * FROM Listener')
    data = cursor.fetchall()
    print(data)
    return render_template('index.html', name=data)

@app.route('/login', methods=['GET'])
def get_login():
    return render_template('login.html')

@app.route('/login', methods=['POST'])
def post_login():
    pass
    # username

@app.route('/register', methods=['GET'])
def get_register():
    return render_template('register.html')

@app.route('/register', methods=['POST'])
def post_register():
    query = 'INSERT INTO Listener (Fname, Lname, Email, DOB, Username, Password, Pnumber, ProfilePic, Bio, CreationStamp) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)'
    vals = ('first', 'last', request.form['email'], date.today(), request.form['username'], request.form['password'], '0000000000', None, None, datetime.now())

    cursor.execute(query, vals)

    return redirect(url_for('index'))

if __name__ == '__main__':
    app.run(debug=True)