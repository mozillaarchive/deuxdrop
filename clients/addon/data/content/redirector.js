self.on('message', function (data) {
    location.replace(data);
});

self.postMessage('ready');
