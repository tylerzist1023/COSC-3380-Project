function getTopbar(x) {
    fetch('/topbar')
    .then((response) => response.text())
    .then((data) => {
        document.getElementById('topBar').innerHTML = data;
    });
}

function getSidebar(x) {
    fetch('/sidebar')
    .then((response) => response.text())
    .then((data) => {
        document.getElementById('leftBar').innerHTML = data;
    });
}

function playSong(this_) {
    if(this_ === null || this_ === undefined) {
        return function() { e.preventDefault();};
    }
    // this may look a little weird, but if you want to pass in an event where the data varies, or if you want to pass in an event that proxies another object, you can create a function that returns a function and use the parameters of the top level function within the returned function. the "this_" object is the anchor object that the user is supposed to click on to play the desired song they want.
    return function(e) {
        e.preventDefault();

        let songid = this_.getAttribute('songid');
        // it's called "ii" because "i" is used as a variable for a for loop
        let ii = this_.getAttribute('ii');
        
        fetch('/song/'+songid)
            .then(response => response.json())
            .then(data => {
                let playerImage = document.getElementById('playerImage');
                let playerSong = document.getElementById('playerSong');
                let playerArtist = document.getElementById('playerArtist');
                let playerSource = document.getElementById('playerSource');
                let playerList = document.getElementById(`list${songid}`);

                // Bottom code didn't work for Artist Info Page but this does. It would play the song but not set the elements with the correct img, song name, and artist name.
                // This resolves that issue
                playerImage.src = '/album/' + data['albumid'] + '/pic';
                playerSong.textContent = data['songname'];
                playerArtist.textContent = data['artistname'];

                // one problem: the "hover" stops working. i don't know how to fix it!
                const trackLists = document.querySelectorAll('.track_list');
                for (let i = 0; i < trackLists.length; i++) {
                    trackLists[i].style.backgroundColor = '#111727';
                }
                playerList.style.backgroundColor = '#636363';
                playerImage.setAttribute('src', '/album/'+data['albumid']+'/pic');
                playerSong.innerHTML = data['songname'];
                playerArtist.innerHTML = data['artistname'];
            })
            .finally(() => {
                let playerSource = document.getElementById('playerSource');
                let playerAudio = document.getElementById('playerAudio');
                playerSource.setAttribute('src', '/song/'+songid+'/audio');
                playerAudio.load();
                playerAudio.play();
                let playerDiv = document.getElementById('playerDiv');
                playerDiv.style.display = '';

                let iiplus1 = parseInt(ii)+1;
                let nextSongLink = document.querySelector('[ii="'+iiplus1+'"]');
                playerAudio.onended = playSong(nextSongLink);
            })
            .catch(error => console.error('Error:', error));
    }
}
