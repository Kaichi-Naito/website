(function () {
    'use strict';
    var key = 'kaichi-desktop-theme';
    var pendingMode = null;
    var mode = 'xp';

    function savedMode() {
        if (pendingMode !== null) return pendingMode;
        var value;
        try { value = localStorage.getItem(key); } catch (e) {}
        if (value !== 'xp' && value !== '95') {
            try { value = sessionStorage.getItem(key); } catch (e) {}
        }
        return value === '95' ? '95' : value === 'xp' ? 'xp' : mode;
    }

    function applySavedTheme() {
        mode = savedMode();
        pendingMode = null;
        var stylesheet = document.getElementById('desktop-xp-styles');
        if (stylesheet) stylesheet.disabled = mode !== 'xp';
        document.documentElement.dataset.desktopTheme = mode;
        if (document.body) document.body.classList.toggle('xp-desktop', mode === 'xp');
        document.dispatchEvent(new CustomEvent('kaichi-desktop-theme-change'));
    }

    window.KaichiDesktopTheme = {
        isXP: function () { return mode === 'xp'; },
        prepareNextTheme: function () {
            // Repeated clicks during one shutdown must schedule only one switch.
            if (pendingMode !== null) return;
            pendingMode = mode === 'xp' ? '95' : 'xp';
            try { localStorage.setItem(key, pendingMode); } catch (e) {}
            try { sessionStorage.setItem(key, pendingMode); } catch (e) {}
        },
        applySavedTheme: applySavedTheme
    };

    applySavedTheme();
    document.addEventListener('DOMContentLoaded', applySavedTheme);
    window.addEventListener('pageshow', applySavedTheme);
})();
