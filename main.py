from flask import Flask, render_template
import pymysql

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
    cursor.execute('SELECT * FROM Artist')
    data = cursor.fetchall()
    return render_template('index.html', name=data)

@app.route('/login')
def login():
    return render_template('login.html')

@app.route('/register')
def register():
    return render_template('register.html')

if __name__ == '__main__':
    app.run(debug=True)