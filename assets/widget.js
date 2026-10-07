/* Maya — "Never Miss a Customer" demo chat engine (restaurant edition).
   100% client-side. No network calls, no tracking. Works from file:// .
   After-hours leads + review feedback persist in the browser only
   (localStorage key "nmc_restaurant_leads").
   Test hooks: ?fast=1 skips delays; window.__maya exposes state + send(). */
(function () {
  'use strict';

  var qs = new URLSearchParams(location.search);
  var FAST = qs.get('fast') === '1';
  var LEAD_KEY = 'nmc_restaurant_leads';

  /* ---------- business profile (personalizable via ?biz= etc.) ---------- */
  var BIZ = {
    name:    qs.get('biz')     || 'Casa Verde',
    tagline: qs.get('tagline') || 'Modern Mexican Kitchen',
    city:    qs.get('city')    || 'Austin, TX',
    address: qs.get('addr') || qs.get('address') || '2410 S Congress Ave, Austin, TX 78704',
    phone:   qs.get('phone')   || '(512) 555-0147',
    host: 'Maya'
  };
  // short ref prefix from the name's initials, e.g. "Casa Verde" -> "CV", "Rose & Rye" -> "RR"
  BIZ.refPrefix = (BIZ.name.split(/\s+/).map(function (w) { return w.charAt(0); }).filter(function (c) { return /[A-Za-z]/.test(c); }).join('').slice(0, 2).toUpperCase()) || 'CV';

  /* apply personalization to the page */
  function personalize() {
    document.querySelectorAll('[data-biz="name"]').forEach(function (el) { el.textContent = BIZ.name; });
    document.querySelectorAll('[data-biz="tagline"]').forEach(function (el) { el.textContent = BIZ.tagline; });
    document.querySelectorAll('[data-biz="city"]').forEach(function (el) { el.textContent = BIZ.city; });
    document.querySelectorAll('[data-biz="address"]').forEach(function (el) { el.textContent = BIZ.address; });
    document.querySelectorAll('[data-biz="phone"]').forEach(function (el) { el.textContent = BIZ.phone; });
    document.querySelectorAll('[data-biz="host"]').forEach(function (el) { el.textContent = BIZ.host; });
    document.querySelectorAll('[data-biz="host-initial"]').forEach(function (el) { el.textContent = BIZ.host.charAt(0); });
    document.title = BIZ.name + ' — ' + BIZ.tagline + ' | ' + BIZ.city;
  }
  /* ---------- deep personalization: ?services= ?hours= ----------
     services: pipe-separated REAL service names -> rendered into the services grid (max 8).
     hours: pipe-separated "Day(s): time" pairs -> rendered into the hours table (max 6).
     Graceful fallback: the page keeps its built-in fictional content when a param is absent. */
  function dpEsc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function deepPersonalize() {
    var svc = qs.get('services');
    if (svc) {
      var items = svc.split('|').map(function (s) { return s.trim(); }).filter(function (s) { return s; }).slice(0, 8);
      var grid = document.querySelector('#services .menu-grid, #menu .menu-grid, #rooms .menu-grid, #practice .menu-grid, #services .cards');
      if (grid && items.length) {
        var isCards = grid.classList.contains('cards');
        grid.innerHTML = items.map(function (name) {
          var n = dpEsc(name);
          if (isCards) {
            return '<div class="card"><div class="ico">&#10003;</div><h3>' + n + '</h3>' +
              '<p>Offered at ' + dpEsc(BIZ.name) + ' &mdash; chat below for details &amp; pricing.</p></div>';
          }
          return '<div class="menu-card"><div class="cat">Service</div><h3>' + n + '</h3>' +
            '<p>Offered at ' + dpEsc(BIZ.name) + ' &mdash; ask ' + dpEsc(BIZ.host) + ' below for details &amp; pricing.</p></div>';
        }).join('');
      }
    }
    var hrs = qs.get('hours');
    if (hrs) {
      var rows = hrs.split('|').map(function (s) { return s.trim(); }).filter(function (s) { return s; }).slice(0, 6);
      var table = document.querySelector('table.hours') || document.querySelector('#visit table');
      if (table && rows.length) {
        var chatCell = null;
        Array.prototype.forEach.call(table.rows, function (r) {
          if (/chat/i.test(r.textContent) && r.cells[1]) chatCell = r.cells[1].innerHTML;
        });
        var html = rows.map(function (r) {
          var i = r.indexOf(':');
          var day = (i > 0 ? r.slice(0, i) : r).trim();
          var time = (i > 0 ? r.slice(i + 1) : '').trim();
          return '<tr><td>' + dpEsc(day) + '</td><td>' + dpEsc(time) + '</td></tr>';
        }).join('');
        if (chatCell) html += '<tr><td>Chat with ' + dpEsc(BIZ.host) + '</td><td>' + chatCell + '</td></tr>';
        table.innerHTML = html;
      }
    }
  }

  /* ---------- leads (localStorage only) ---------- */
  var leads = [];
  try { leads = JSON.parse(localStorage.getItem(LEAD_KEY) || '[]'); } catch (e) { leads = []; }
  function saveLead(l) {
    l.at = new Date().toISOString(); l.biz = BIZ.name;
    leads.push(l);
    try { localStorage.setItem(LEAD_KEY, JSON.stringify(leads)); } catch (e) {}
  }

  /* ---------- dom ---------- */
  var panel, msgs, chipsBox, input, bubble, unread, closeBtn;
  var opened = false, autoOpened = false, greeted = false;

  /* conversation state */
  var S = {
    mode: 'idle',          // idle | booking | afterhours | review
    step: 0,
    booking: {},
    ah: {},
    lastTopic: null
  };

  function $(id) { return document.getElementById(id); }

  function delay(ms) {
    return new Promise(function (res) { setTimeout(res, FAST ? 0 : ms); });
  }

  function scrollDown() { msgs.scrollTop = msgs.scrollHeight; }

  function el(tag, cls, html) {
    var d = document.createElement(tag);
    if (cls) d.className = cls;
    if (html !== undefined) d.innerHTML = html;
    return d;
  }

  /* ---------- rendering ---------- */
  function addUser(text) {
    var row = el('div', 'mrow user');
    row.appendChild(el('div', 'bubble', escapeHtml(text)));
    msgs.appendChild(row); scrollDown();
  }

  function addBot(html, opts) {
    var row = el('div', 'mrow bot');
    row.appendChild(el('div', 'mavatar', BIZ.host.charAt(0)));
    var b = el('div', 'bubble', html);
    row.appendChild(b);
    msgs.appendChild(row);
    if (opts && opts.notice) b.classList.add('notice');
    scrollDown();
    return b;
  }

  function addNotice(html) {
    var row = el('div', 'mrow bot');
    row.appendChild(el('div', 'notice', html));
    row.style.maxWidth = '100%';
    msgs.appendChild(row); scrollDown();
  }

  function addDashCard(rows) {
    var row = el('div', 'mrow bot');
    var card = el('div', 'dashcard');
    card.appendChild(el('div', 'dl-head', '&#128203; Saved to your dashboard'));
    rows.forEach(function (r) {
      card.appendChild(el('div', 'dl-row', '<span>' + r[0] + ':</span> <b>' + escapeHtml(r[1]) + '</b>'));
    });
    row.appendChild(card);
    row.style.maxWidth = '100%';
    msgs.appendChild(row); scrollDown();
  }

  function showTyping() {
    var row = el('div', 'mrow bot', '');
    row.id = 'maya-typing-row';
    row.appendChild(el('div', 'mavatar', BIZ.host.charAt(0)));
    var b = el('div', 'bubble typing', '<i></i><i></i><i></i>');
    row.appendChild(b);
    msgs.appendChild(row); scrollDown();
  }
  function hideTyping() {
    var t = $('maya-typing-row');
    if (t) t.remove();
  }

  function setChips(list) {
    chipsBox.innerHTML = '';
    (list || []).forEach(function (c) {
      var btn = el('button', 'chip', c.label);
      btn.type = 'button';
      btn.addEventListener('click', function () { userSays(c.value || c.label, c.silent); });
      chipsBox.appendChild(btn);
    });
    scrollDown();
  }

  function showStars() {
    chipsBox.innerHTML = '';
    var wrap = el('div', 'stars-row');
    for (var i = 1; i <= 5; i++) {
      (function (n) {
        var s = el('button', 'star-btn', '&#11088;');
        s.type = 'button';
        s.setAttribute('aria-label', n + ' star' + (n > 1 ? 's' : ''));
        s.addEventListener('click', function () { pickStars(n); });
        wrap.appendChild(s);
      })(i);
    }
    chipsBox.appendChild(wrap);
    scrollDown();
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  /* ---------- bot speech ---------- */
  function say(html, chips, opts) {
    showTyping();
    var wait = Math.min(700 + html.length * 6, 1900);
    return delay(wait).then(function () {
      hideTyping();
      addBot(html);
      setChips(chips);
    });
  }

  function sayMany(items) {
    // items: [{html, chips, notice, dash}]
    var p = Promise.resolve();
    items.forEach(function (it) {
      p = p.then(function () {
        showTyping();
        var wait = Math.min(600 + (it.html || '').length * 5, 1700);
        return delay(wait).then(function () {
          hideTyping();
          if (it.dash) { addDashCard(it.dash); }
          else if (it.notice) { addNotice(it.html); }
          else { addBot(it.html); }
          setChips(it.chips);
        });
      });
    });
    return p;
  }

  /* ---------- helpers ---------- */
  function makeRef() {
    var chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
    var r = '';
    for (var i = 0; i < 5; i++) r += chars.charAt(Math.floor(Math.random() * chars.length));
    return BIZ.refPrefix + '-' + r;
  }

  var WORDNUM = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, twelve: 12 };
  function parseParty(t) {
    var m = t.match(/\d{1,2}/);
    if (m) return parseInt(m[0], 10);
    var low = t.toLowerCase();
    for (var w in WORDNUM) if (low.indexOf(w) !== -1) return WORDNUM[w];
    return null;
  }
  function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

  /* word-start keyword match (proven standard, 2026-10-03): "anywhere" must not
     trip the "where" location keyword, "recall" must not trip the human-call
     branch. Prefix keywords like 'reserv'/'schedul' still match 'reservation'/
     'schedule'; phrases keep word-start match. */
  function escRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
  function has(t) {
    var words = Array.prototype.slice.call(arguments, 1);
    return words.some(function (w) { return new RegExp('(^|[^a-z])' + escRe(w)).test(t); });
  }

  function digitsOf(s) { return String(s).replace(/\D/g, ''); }

  /* ---------- intent answers ---------- */
  function hoursHtml() {
    return '<b>We\'re open:</b><br>Mon&ndash;Thu &middot; 11 AM &ndash; 10 PM<br>' +
      'Fri&ndash;Sat &middot; 11 AM &ndash; 11 PM<br>Sun &middot; 10 AM &ndash; 9 PM <i>(brunch 10&ndash;2)</i><br><br>' +
      'Kitchen closes 30 min before we do. Want me to grab you a table?';
  }

  function menuHtml() {
    return 'Taco Tuesday energy, every day. &#127790;<br><br>' +
      '<b>Guest favorites:</b><br>&middot; Baja Fish Tacos &mdash; $14<br>' +
      '&middot; Al Pastor Tacos &mdash; $12<br>&middot; Verde Enchiladas &mdash; $16<br>' +
      '&middot; Chipotle Chicken Bowl &mdash; $15<br>&middot; Queso Fundido &mdash; $11<br><br>' +
      'Plenty of <b>vegan</b> and <b>gluten-free</b> options too. Anything catching your eye?';
  }

  function defaultChips() {
    return [
      { label: '&#128203; See the menu' },
      { label: '&#128197; Book a table' },
      { label: '&#127769; After-hours demo' },
      { label: '&#11088; Rate your visit' }
    ];
  }

  function greet() {
    greeted = true;
    return say(
      'Hi there! I\'m <b>' + escapeHtml(BIZ.host) + '</b>, ' + escapeHtml(BIZ.name) + '\'s host. &#127790;<br><br>' +
      'Ask me about the <b>menu</b> or <b>hours</b> &mdash; or I can <b>book you a table</b> right now. What sounds good?',
      defaultChips()
    );
  }

  /* ---------- flows ---------- */
  function startBooking() {
    S.mode = 'booking'; S.step = 0; S.booking = {};
    return say('Wonderful &mdash; let\'s get you a table. <b>How many guests?</b>',
      [{ label: '2' }, { label: '4' }, { label: '6' }, { label: '8+' }]);
  }

  function bookingStep(text) {
    var t = text.toLowerCase().trim();
    if (S.step === 0) {
      var n = parseParty(t);
      if (!n || n < 1 || n > 30) {
        return say('How many guests should I set the table for? <i>(a number works great)</i>',
          [{ label: '2' }, { label: '4' }, { label: '6' }]);
      }
      S.booking.party = (t.indexOf('8+') !== -1 || n >= 8) ? '8+' : String(n);
      S.step = 1;
      return say('<b>Table for ' + escapeHtml(S.booking.party) + '</b> &mdash; lovely. <b>Which day?</b>',
        [{ label: 'Tonight' }, { label: 'Tomorrow' }, { label: 'Friday' }, { label: 'Saturday' }]);
    }
    if (S.step === 1) {
      var day = 'Friday';
      if (has(t, 'tonight', 'today')) day = 'Tonight';
      else if (has(t, 'tomorrow')) day = 'Tomorrow';
      else {
        var dm = t.match(/monday|tuesday|wednesday|thursday|friday|saturday|sunday/);
        if (dm) day = cap(dm[0]);
      }
      S.booking.day = day; S.step = 2;
      return say('<b>' + escapeHtml(day) + '</b> it is. <b>What time works best?</b>',
        [{ label: '6:00 PM' }, { label: '6:30 PM' }, { label: '7:00 PM' }, { label: '7:30 PM' }, { label: '8:00 PM' }]);
    }
    if (S.step === 2) {
      var tm = t.match(/\d{1,2}(:\d{2})?\s*(am|pm)?/);
      if (!tm) {
        return say('What <b>time</b> should I hold the table for? <i>(e.g. 7:00 PM)</i>',
          [{ label: '6:30 PM' }, { label: '7:00 PM' }, { label: '7:30 PM' }]);
      }
      var time = text.trim();
      if (!/am|pm/i.test(time)) time += ' PM';
      S.booking.time = time; S.step = 3;
      return say('Perfect &mdash; <b>' + escapeHtml(S.booking.time) + '</b>. <b>What name</b> should I put the reservation under?');
    }
    if (S.step === 3) {
      var name = text.trim();
      if (name.length < 2 || name.length > 40) {
        return say('And the <b>name</b> for the reservation?');
      }
      S.booking.name = name; S.step = 4;
      return say('Almost done, ' + escapeHtml(cap(name.split(' ')[0])) +
        '! Want a <b>text confirmation</b>? Drop your number &mdash; or skip it.',
        [{ label: 'Skip', value: 'skip' }]);
    }
    if (S.step === 4) {
      var ref = makeRef();
      S.booking.ref = ref;
      var line = '<b>&#9989; You\'re booked!</b><br><br>Table for <b>' + escapeHtml(S.booking.party) + '</b> &middot; ' +
        escapeHtml(S.booking.day) + ' at <b>' + escapeHtml(S.booking.time) + '</b><br>Under: <b>' + escapeHtml(S.booking.name) + '</b><br>' +
        'Reference: <span class="ref">' + ref + '</span><br><br>';
      if (t !== 'skip' && /\d/.test(t)) line += 'Confirmation text on its way. ';
      line += 'Show this reference at the door &mdash; we\'ll have your table ready. Anything else I can help with?';
      S.mode = 'idle'; S.step = 0;
      return say(line, [{ label: '&#128203; See the menu' }, { label: '&#128336; Hours & location' }]);
    }
  }

  function startAfterHours() {
    S.mode = 'afterhours'; S.step = 0; S.ah = {};
    return sayMany([
      {
        notice: true,
        html: '&#127769; <b>It\'s 11:42 PM</b> &mdash; we\'re closed right now, but I\'m ' + escapeHtml(BIZ.host) +
          ', ' + escapeHtml(BIZ.name) + '\'s host, and I\'m still here. <b>No customer waits till morning.</b>'
      },
      { html: 'Leave your <b>name</b> and I\'ll make sure the morning team confirms your table by <b>11 AM</b>.' }
    ]);
  }

  function afterHoursStep(text) {
    var t = text.trim();
    if (S.step === 0) {
      if (t.length < 2 || t.length > 40 || /\d/.test(t)) {
        return say('What <b>name</b> should I save this under?');
      }
      S.ah.name = t; S.step = 1;
      return say('Thanks, ' + escapeHtml(cap(t.split(' ')[0])) + '! And the best <b>number</b> to reach you in the morning?');
    }
    if (S.step === 1) {
      var digits = digitsOf(t);
      if (digits.length < 7) {
        return say('Hmm, that doesn\'t look like a complete number &mdash; mind double-checking it? <i>(digits only is fine)</i>');
      }
      S.ah.phone = t; S.step = 2;
      return say('Got it. And <b>what should we set up</b> for you? <i>(e.g. "table for 2 Friday")</i>',
        [{ label: 'Just a table for 2', value: 'Table for 2' }, { label: 'Skip', value: 'skip' }]);
    }
    if (S.step === 2) {
      S.ah.request = (t === 'skip') ? 'General inquiry' : t;
      saveLead({ name: S.ah.name, phone: S.ah.phone, wants: S.ah.request, source: 'after-hours 11:42 PM' });
      S.mode = 'idle'; S.step = 0;
      return sayMany([
        { html: '<b>&#9989; Saved!</b> We\'ll confirm by <b>11 AM</b> &mdash; no need to call back or wonder if anyone saw your message.' },
        {
          dash: [
            ['New lead', S.ah.name],
            ['Phone', S.ah.phone],
            ['Wants', S.ah.request],
            ['Captured', '11:42 PM (after hours)']
          ]
        },
        {
          html: 'That\'s the whole point &mdash; <b>every late-night visitor becomes a morning reservation</b>, not a missed customer. Anything else tonight?',
          chips: defaultChips()
        }
      ]);
    }
  }

  function startReview() {
    S.mode = 'review'; S.step = 0;
    return say('We\'d love to hear it &mdash; <b>how was your meal?</b> Tap the stars:').then(function () {
      showStars();
    });
  }

  function pickStars(n) {
    chipsBox.innerHTML = '';
    addUser('\u2B50'.repeat(n));
    if (n === 5) {
      S.mode = 'idle';
      say('That made our day! &#128525;<br><br>Would you <b>share that on Google</b>? It genuinely keeps a local spot like us thriving.',
        [{ label: 'Not now', value: 'not now' }]).then(function () {
          var row = document.querySelector('#maya-msgs .mrow.bot:last-child .bubble');
          if (row) {
            var a = document.createElement('a');
            a.className = 'gbtn'; a.href = 'https://www.google.com/maps'; a.target = '_blank'; a.rel = 'noopener';
            a.textContent = '\u2B50 Leave a Google review';
            row.appendChild(document.createElement('br'));
            row.appendChild(a); scrollDown();
          }
        });
    } else {
      S.mode = 'review'; S.step = 1;
      say('Thank you for being honest &mdash; that\'s how we get better. <b>What could we do better</b> next time?');
    }
  }

  function reviewStep(text) {
    S.mode = 'idle'; S.step = 0;
    saveLead({ name: '(review feedback)', phone: '\u2014', topic: 'Private feedback', details: text.trim(), source: 'review routing' });
    return say('<b>Noted &mdash; truly.</b> Our manager will personally follow up on this.<br><br>' +
      'We\'d love a second chance to earn those last stars. Can I book you a table for another try?',
      [{ label: '&#128197; Book a table' }, { label: 'No thanks', value: 'no thanks' }]);
  }

  /* ---------- main router ---------- */
  function route(text) {
    var t = text.toLowerCase().trim();

    if (S.mode === 'booking') return bookingStep(text);
    if (S.mode === 'afterhours') return afterHoursStep(text);
    if (S.mode === 'review' && S.step === 1) return reviewStep(text);

    if (has(t, 'book', 'reserv', 'table for', 'seat')) return startBooking();
    if (has(t, 'after hour', 'after-hour', 'closed', 'late night', 'midnight', '11:42')) return startAfterHours();
    if (has(t, 'review', 'rate', 'stars', 'feedback')) return startReview();
    /* location branch runs before service branches (house standard) */
    if (has(t, 'where', 'address', 'location', 'direction', 'park', 'find you')) {
      return say('Find us at <b>' + escapeHtml(BIZ.address) + '</b> &mdash; free parking out back. &#128205;<br><br>Call us anytime: <b>' + escapeHtml(BIZ.phone) + '</b>',
        [{ label: '&#128197; Book a table' }]);
    }
    if (has(t, 'hour', 'open', 'close', 'when do you', 'what time')) return say(hoursHtml(), [{ label: '&#128197; Book a table' }]);
    if (has(t, 'menu', 'taco', 'food', 'dish', 'hungry', 'enchilada', 'queso', 'burrito', 'margarita') || /\beat\b/.test(t)) return say(menuHtml(), [{ label: '&#128197; Book a table' }]);
    if (has(t, 'price', 'cost', 'how much', 'expensive', 'cheap', '$$')) return say('Easy on the wallet &mdash; most plates run <b>$11&ndash;$18</b>, tacos from <b>$12</b>. Dinner for two with margaritas usually lands around <b>$55&ndash;$70</b>. &#127790;', [{ label: '&#128203; See the menu' }]);
    if (has(t, 'deliver', 'takeout', 'take out', 'to go', 'uber eat', 'doordash')) return say('Yes &mdash; <b>takeout and delivery</b>, ready in about 20 minutes. Order right here and I\'ll have the kitchen fire it up. What are you craving?', [{ label: '&#128203; See the menu' }]);
    if (has(t, 'vegan')) return say('Yes! Our <b>jackfruit carnitas tacos</b> ($13) and <b>roasted veggie bowl</b> ($14) are fully vegan &mdash; and most dishes can be made vegan on request. &#129382;', [{ label: '&#128197; Book a table' }]);
    if (has(t, 'vegetarian')) return say('Plenty! <b>Queso fundido</b> ($11), <b>verde enchiladas</b> ($16, ask veggie-style), and our <b>street corn</b> ($7) are all vegetarian. &#127803;', [{ label: '&#128197; Book a table' }]);
    if (has(t, 'gluten')) return say('Most of our menu is <b>gluten-free</b> &mdash; everything on corn tortillas, plus all bowls and salads. Just mention it and the kitchen takes care of the rest.', [{ label: '&#128197; Book a table' }]);
    if (has(t, 'human', 'person', 'real person', 'call you', 'phone number', 'speak to')) return say('Of course &mdash; call us at <b>' + escapeHtml(BIZ.phone) + '</b> during open hours and a real human picks up. But honestly? I can handle <b>bookings, menus, and hours</b> right here, even at 2 AM. &#128521;', defaultChips());
    if (has(t, 'thank', 'thanks', 'thx', 'great', 'awesome', 'perfect')) return say('Anytime! That\'s what I\'m here for. &#127790;', defaultChips());
    if (has(t, 'bye', 'goodbye', 'see you', 'later')) { S.mode = 'idle'; return say('See you soon at ' + escapeHtml(BIZ.name) + '! Bring an appetite. &#127790;'); }
    if (/\b(hi+|hello|hey+|hola|yo)\b/.test(t) || has(t, 'good morning', 'good evening')) return say('Hey hey! &#128075; What can I do for you &mdash; <b>menu</b>, <b>hours</b>, or shall I <b>book a table</b>?', defaultChips());
    if (has(t, 'no thanks', 'not now', 'nope', "i'm good", 'im good')) { S.mode = 'idle'; return say('No worries at all! I\'m here whenever you need me. &#127790;', defaultChips()); }

    /* graceful fallback — never dead-ends */
    S.lastTopic = text;
    return say('Great question &mdash; let me have the team confirm that for you. &#128172;<br><br>Meanwhile, can I help with a <b>reservation</b>, the <b>menu</b>, or our <b>hours</b>?',
      [{ label: '&#128197; Book a table' }, { label: '&#128203; See the menu' }, { label: '&#128336; Hours & location' }]);
  }

  function userSays(text, silent) {
    if (!text || !text.trim()) return Promise.resolve();
    text = text.trim();
    setChips([]);
    if (!silent) addUser(text);
    return route(text);
  }

  /* ---------- open / close ---------- */
  function openPanel(silent) {
    opened = true;
    panel.classList.add('open');
    bubble.classList.add('hidden');
    unread.classList.add('hidden');
    if (!greeted && !silent) greet();
  }
  function closePanel() {
    opened = false;
    panel.classList.remove('open');
    bubble.classList.remove('hidden');
  }

  function init() {
    panel = $('maya-panel'); msgs = $('maya-msgs'); chipsBox = $('maya-chips');
    input = $('maya-input'); bubble = $('maya-bubble'); unread = $('maya-unread'); closeBtn = $('maya-close');
    personalize();
    deepPersonalize();

    /* bubble click greets normally; hero CTA passes silent=true to skip straight to booking */
    bubble.addEventListener('click', function () { openPanel(); });
    closeBtn.addEventListener('click', closePanel);
    $('maya-send').addEventListener('click', function () { userSays(input.value); input.value = ''; input.focus(); });
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { userSays(input.value); input.value = ''; }
    });

    /* hero CTA opens widget straight into booking */
    document.querySelectorAll('[data-action="book"]').forEach(function (b) {
      b.addEventListener('click', function (e) {
        e.preventDefault();
        openPanel(true); /* silent: goes straight to booking, no greeting */
        setTimeout(function () { if (S.mode === 'idle') startBooking(); }, FAST ? 50 : 600);
      });
    });

    /* proactive nudge — once, ~8s in */
    setTimeout(function () {
      if (!opened && !autoOpened) {
        autoOpened = true;
        unread.classList.remove('hidden');
        bubble.classList.add('hidden');
        panel.classList.add('open');
        opened = true;
        if (!greeted) greet();
      }
    }, FAST ? 600 : 8000);

    /* test hooks */
    window.__maya = {
      BIZ: BIZ, S: S,
      send: function (t) { openPanel(); return userSays(t); },
      open: openPanel, close: closePanel,
      pickStars: pickStars,
      getLeads: function () { return leads; },
      clearLeads: function () { leads = []; try { localStorage.removeItem(LEAD_KEY); } catch (e) {} }
    };
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
