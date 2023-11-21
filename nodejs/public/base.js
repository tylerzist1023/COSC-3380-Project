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