(function () {
    'use strict';
    var embedded = window.self !== window.top;
    var forced = new URLSearchParams(location.search).get('view') === 'rotated';
    var portrait = window.innerHeight > window.innerWidth;
    var phone = window.matchMedia('(max-width: 800px)').matches ||
        (window.matchMedia('(pointer: coarse)').matches && Math.min(window.innerWidth, window.innerHeight) <= 800);
    var host = !embedded && (forced || phone);
    var pcWidth = 1366;

    window.KaichiTestRotation = { isHost: function () { return host; } };
    if (embedded) document.documentElement.classList.add('test-pc-frame');
    if (!host) return;
    document.documentElement.classList.add('test-rotated-host');

    document.addEventListener('DOMContentLoaded', function () {
        var viewport = document.createElement('div');
        viewport.id = 'rotated-desktop-viewport';
        var frame = document.createElement('iframe');
        frame.id = 'rotated-desktop-frame';
        frame.title = 'Kaichi Guitar Music — PC desktop';
        frame.setAttribute('allow', 'autoplay; fullscreen');
        frame.setAttribute('allowfullscreen', '');
        // The inner document is not a host, preventing recursive frames.
        var source = new URL('test/index.html', document.baseURI);
        source.searchParams.set('desktop', '1');
        frame.src = source.href;
        viewport.appendChild(frame);
        document.body.replaceChildren(viewport);

        function fitDesktop() {
            var bounds = viewport.getBoundingClientRect();
            if (!bounds.width || !bounds.height) return;
            portrait = bounds.height > bounds.width;
            var rotate = forced || portrait;
            var availableWidth = rotate ? bounds.height : bounds.width;
            var availableHeight = rotate ? bounds.width : bounds.height;
            var scale = availableWidth / pcWidth;
            frame.style.width = pcWidth + 'px';
            frame.style.height = (availableHeight / scale) + 'px';
            frame.style.transform = rotate
                ? 'translateX(' + bounds.width + 'px) rotate(90deg) scale(' + scale + ')'
                : 'scale(' + scale + ')';
            viewport.dataset.rotation = rotate ? '90' : '0';
        }

        fitDesktop();
        window.addEventListener('resize', fitDesktop);
        if (window.visualViewport) window.visualViewport.addEventListener('resize', fitDesktop);
        if (typeof ResizeObserver !== 'undefined') new ResizeObserver(fitDesktop).observe(viewport);
    }, { once: true });
})();
