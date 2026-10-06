(function () {
    'use strict';
    var key = 'kaichi-desktop-theme';
    var pending95 = false;
    var mode = 'xp';

    function savedMode() {
        var value;
        try { value = localStorage.getItem(key); } catch (e) {}
        try { if (sessionStorage.getItem(key) === '95') value = '95'; } catch (e) {}
        return pending95 || value === '95' ? '95' : 'xp';
    }

    function applySavedTheme() {
        mode = savedMode();
        var stylesheet = document.getElementById('desktop-xp-styles');
        if (stylesheet) stylesheet.disabled = mode !== 'xp';
        document.documentElement.dataset.desktopTheme = mode;
        if (document.body) document.body.classList.toggle('xp-desktop', mode === 'xp');
        document.dispatchEvent(new CustomEvent('kaichi-desktop-theme-change'));
    }

    window.KaichiDesktopTheme = {
        isXP: function () { return mode === 'xp'; },
        rememberWindows95: function () {
            pending95 = true;
            try { localStorage.setItem(key, '95'); } catch (e) {}
            try { sessionStorage.setItem(key, '95'); } catch (e) {}
        },
        applySavedTheme: applySavedTheme
    };

    applySavedTheme();
    document.addEventListener('DOMContentLoaded', applySavedTheme);
    window.addEventListener('pageshow', applySavedTheme);
})();
