  // Browser settings: the project was called Random Pin, and its settings were stored under randompin.*
  // keys. Move them to huddle.* once, before anything reads them, so nobody loses their id, name,
  // theme or layout.
  (function () {
    try {
      var old = [];
      for (var i = 0; i < localStorage.length; i++) if (localStorage.key(i).indexOf('randompin.') === 0) old.push(localStorage.key(i));
      old.forEach(function (k) {
        var to = 'huddle.' + k.slice('randompin.'.length);
        if (localStorage.getItem(to) == null) localStorage.setItem(to, localStorage.getItem(k));
        localStorage.removeItem(k);
      });
    } catch (e) {}
  })();
