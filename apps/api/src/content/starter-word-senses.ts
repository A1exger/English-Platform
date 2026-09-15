// Meanings for the polysemous words in the starter bank.
//
// Kept apart from the word list on purpose: the list answers "which words does a
// learner need", this file answers "and what does each one mean". Only a
// minority of words need it — most have a single sense the gloss already covers
// — so keying by word rather than repeating the whole list keeps both readable.
//
// The English definition is the sense itself; `translations` gives the word a
// reader's language uses FOR THAT MEANING, which is the whole point — "book" is
// книга in one sense and бронировать in the other, and a single per-word gloss
// cannot say that. `en` is deliberately absent: for an English reader the
// definition already is the answer.
export interface StarterSense {
  partOfSpeech: string;
  /** What this particular meaning is, in plain English. */
  definition: string;
  example?: string;
  /** locale -> the word used for THIS meaning (no `en`; see above). */
  translations: Record<string, string>;
}

const s = (
  partOfSpeech: string,
  definition: string,
  example: string,
  translations: Record<string, string>,
): StarterSense => ({ partOfSpeech, definition, example, translations });

/** word (lowercase) -> its meanings, in the order a learner meets them. */
export const STARTER_WORD_SENSES: Record<string, StarterSense[]> = {
  book: [
    s('noun', 'printed pages bound together for reading', 'She read the book twice.', { ru: 'книга', de: 'Buch', fr: 'livre', nl: 'boek', ar: 'كتاب' }),
    s('verb', 'to reserve something in advance', 'We booked a table for eight.', { ru: 'бронировать', de: 'buchen', fr: 'réserver', nl: 'boeken', ar: 'يحجز' }),
  ],
  light: [
    s('noun', 'the brightness that lets you see', 'There is more light by the window.', { ru: 'свет', de: 'Licht', fr: 'lumière', nl: 'licht', ar: 'ضوء' }),
    s('noun', 'a lamp or other thing that shines', 'Turn the light off, please.', { ru: 'лампа', de: 'Lampe', fr: 'lampe', nl: 'lamp', ar: 'مصباح' }),
    s('adjective', 'not heavy', 'The bag is light enough to carry.', { ru: 'лёгкий', de: 'leicht', fr: 'léger', nl: 'licht', ar: 'خفيف' }),
    s('adjective', 'pale in colour', 'He wore a light blue shirt.', { ru: 'светлый', de: 'hell', fr: 'clair', nl: 'lichtgekleurd', ar: 'فاتح' }),
  ],
  right: [
    s('adjective', 'correct; not wrong', 'That is the right answer.', { ru: 'правильный', de: 'richtig', fr: 'correct', nl: 'juist', ar: 'صحيح' }),
    s('noun', 'the side opposite the left', 'Turn to the right at the corner.', { ru: 'право (сторона)', de: 'rechte Seite', fr: 'droite', nl: 'rechts', ar: 'يمين' }),
    s('noun', 'something you are allowed to have or do', 'Everyone has the right to an education.', { ru: 'право', de: 'Recht', fr: 'droit', nl: 'recht', ar: 'حق' }),
  ],
  second: [
    s('noun', 'a very short unit of time; one sixtieth of a minute', 'Wait a second, please.', { ru: 'секунда', de: 'Sekunde', fr: 'seconde', nl: 'seconde', ar: 'ثانية' }),
    s('adjective', 'coming after the first', 'This is my second attempt.', { ru: 'второй', de: 'zweiter', fr: 'deuxième', nl: 'tweede', ar: 'ثانٍ' }),
  ],
  spring: [
    s('noun', 'the season after winter', 'The garden is best in spring.', { ru: 'весна', de: 'Frühling', fr: 'printemps', nl: 'lente', ar: 'ربيع' }),
    s('noun', 'a coil of metal that returns to its shape', 'The spring in the pen is broken.', { ru: 'пружина', de: 'Feder', fr: 'ressort', nl: 'veer', ar: 'زنبرك' }),
    s('verb', 'to jump suddenly', 'The cat sprang onto the table.', { ru: 'прыгать', de: 'springen', fr: 'bondir', nl: 'springen', ar: 'يقفز' }),
  ],
  key: [
    s('noun', 'a small metal object that opens a lock', 'I left my keys at home.', { ru: 'ключ', de: 'Schlüssel', fr: 'clé', nl: 'sleutel', ar: 'مفتاح' }),
    s('noun', 'a button on a keyboard', 'Press the Enter key.', { ru: 'клавиша', de: 'Taste', fr: 'touche', nl: 'toets', ar: 'مفتاح لوحة' }),
    s('adjective', 'most important', 'Trust is the key factor here.', { ru: 'ключевой', de: 'entscheidend', fr: 'clé', nl: 'belangrijkste', ar: 'رئيسي' }),
  ],
  floor: [
    s('noun', 'the surface you walk on inside a building', 'The floor is wet.', { ru: 'пол', de: 'Boden', fr: 'sol', nl: 'vloer', ar: 'أرضية' }),
    s('noun', 'a level of a building', 'Our office is on the third floor.', { ru: 'этаж', de: 'Stockwerk', fr: 'étage', nl: 'verdieping', ar: 'طابق' }),
  ],
  break: [
    s('verb', 'to damage something so it is in pieces', 'Careful, you will break the glass.', { ru: 'ломать', de: 'zerbrechen', fr: 'casser', nl: 'breken', ar: 'يكسر' }),
    s('noun', 'a short rest from work', "Let's take a ten-minute break.", { ru: 'перерыв', de: 'Pause', fr: 'pause', nl: 'pauze', ar: 'استراحة' }),
    s('verb', 'to fail to keep a rule or promise', 'He broke his promise again.', { ru: 'нарушать', de: 'brechen', fr: 'rompre', nl: 'verbreken', ar: 'يخالف' }),
  ],
  change: [
    s('verb', 'to make or become different', 'They changed the schedule.', { ru: 'менять', de: 'ändern', fr: 'changer', nl: 'veranderen', ar: 'يغير' }),
    s('noun', 'money you get back after paying', 'Keep the change.', { ru: 'сдача', de: 'Wechselgeld', fr: 'monnaie', nl: 'wisselgeld', ar: 'باقي النقود' }),
    s('verb', 'to put on different clothes', 'I need to change before dinner.', { ru: 'переодеваться', de: 'sich umziehen', fr: 'se changer', nl: 'omkleden', ar: 'يبدل ملابسه' }),
  ],
  keep: [
    s('verb', 'to continue to have something', 'You can keep the book.', { ru: 'оставить себе', de: 'behalten', fr: 'garder', nl: 'houden', ar: 'يحتفظ' }),
    s('verb', 'to continue doing something', 'She kept asking questions.', { ru: 'продолжать', de: 'weitermachen', fr: 'continuer à', nl: 'blijven', ar: 'يستمر' }),
    s('verb', 'to store something in a place', 'I keep the documents in this drawer.', { ru: 'хранить', de: 'aufbewahren', fr: 'ranger', nl: 'bewaren', ar: 'يحفظ' }),
  ],
  take: [
    s('verb', 'to pick something up and carry it', 'Take an umbrella with you.', { ru: 'брать', de: 'nehmen', fr: 'prendre', nl: 'nemen', ar: 'يأخذ' }),
    s('verb', 'to need a certain amount of time', 'The trip takes two hours.', { ru: 'занимать (время)', de: 'dauern', fr: 'prendre (du temps)', nl: 'duren', ar: 'يستغرق' }),
    s('verb', 'to travel using something', 'We took the train to Berlin.', { ru: 'ехать на', de: 'nehmen (Verkehrsmittel)', fr: 'prendre (un transport)', nl: 'nemen (vervoer)', ar: 'يستقل' }),
  ],
  make: [
    s('verb', 'to produce or create something', 'She makes her own bread.', { ru: 'делать', de: 'machen', fr: 'faire', nl: 'maken', ar: 'يصنع' }),
    s('verb', 'to force someone to do something', 'They made him wait outside.', { ru: 'заставлять', de: 'zwingen', fr: 'obliger', nl: 'dwingen', ar: 'يجبر' }),
    s('verb', 'to earn money', 'He makes a good salary.', { ru: 'зарабатывать', de: 'verdienen', fr: 'gagner', nl: 'verdienen', ar: 'يكسب' }),
  ],
  work: [
    s('noun', 'the job you do to earn money', 'I go to work at eight.', { ru: 'работа', de: 'Arbeit', fr: 'travail', nl: 'werk', ar: 'عمل' }),
    s('verb', 'to do a job', 'She works in a hospital.', { ru: 'работать', de: 'arbeiten', fr: 'travailler', nl: 'werken', ar: 'يعمل' }),
    s('verb', 'to function correctly', 'The printer is not working.', { ru: 'функционировать', de: 'funktionieren', fr: 'fonctionner', nl: 'functioneren', ar: 'يشتغل' }),
  ],
  play: [
    s('verb', 'to take part in a game', 'The children play in the garden.', { ru: 'играть', de: 'spielen', fr: 'jouer', nl: 'spelen', ar: 'يلعب' }),
    s('verb', 'to perform music', 'He plays the guitar.', { ru: 'играть (на инструменте)', de: 'spielen (Instrument)', fr: 'jouer (d’un instrument)', nl: 'bespelen', ar: 'يعزف' }),
    s('noun', 'a story performed in a theatre', 'We saw a play last night.', { ru: 'пьеса', de: 'Theaterstück', fr: 'pièce de théâtre', nl: 'toneelstuk', ar: 'مسرحية' }),
  ],
  hand: [
    s('noun', 'the part of the body at the end of the arm', 'Wash your hands before eating.', { ru: 'рука (кисть)', de: 'Hand', fr: 'main', nl: 'hand', ar: 'يد' }),
    s('noun', 'a pointer on a clock', 'The small hand shows the hour.', { ru: 'стрелка', de: 'Zeiger', fr: 'aiguille', nl: 'wijzer', ar: 'عقرب الساعة' }),
    s('verb', 'to give something to someone', 'Please hand me the salt.', { ru: 'передавать', de: 'reichen', fr: 'passer', nl: 'aanreiken', ar: 'يناول' }),
  ],
  head: [
    s('noun', 'the top part of the body', 'He hit his head on the door.', { ru: 'голова', de: 'Kopf', fr: 'tête', nl: 'hoofd', ar: 'رأس' }),
    s('noun', 'the person in charge', 'She is the head of the department.', { ru: 'глава', de: 'Leiter', fr: 'chef', nl: 'hoofd (leider)', ar: 'رئيس' }),
    s('verb', 'to go in a direction', 'We headed north.', { ru: 'направляться', de: 'sich begeben', fr: 'se diriger', nl: 'gaan richting', ar: 'يتجه' }),
  ],
  heart: [
    s('noun', 'the organ that pumps blood', 'His heart beats fast.', { ru: 'сердце', de: 'Herz', fr: 'cœur', nl: 'hart', ar: 'قلب' }),
    s('noun', 'the centre of something', 'They live in the heart of the city.', { ru: 'центр', de: 'Zentrum', fr: 'cœur (centre)', nl: 'hart (centrum)', ar: 'قلب المكان' }),
  ],
  eye: [
    s('noun', 'the part of the body you see with', 'She has green eyes.', { ru: 'глаз', de: 'Auge', fr: 'œil', nl: 'oog', ar: 'عين' }),
    s('noun', 'the small hole in a needle', 'I cannot thread the eye of the needle.', { ru: 'ушко (иглы)', de: 'Nadelöhr', fr: 'chas', nl: 'oog van de naald', ar: 'ثقب الإبرة' }),
  ],
  leave: [
    s('verb', 'to go away from a place', 'The train leaves at six.', { ru: 'уезжать', de: 'abfahren', fr: 'partir', nl: 'vertrekken', ar: 'يغادر' }),
    s('verb', 'to let something stay where it is', 'Leave your coat here.', { ru: 'оставлять', de: 'lassen', fr: 'laisser', nl: 'laten liggen', ar: 'يترك' }),
    s('noun', 'time away from work', 'She is on maternity leave.', { ru: 'отпуск', de: 'Urlaub', fr: 'congé', nl: 'verlof', ar: 'إجازة' }),
  ],
  meeting: [
    s('noun', 'an arranged gathering to discuss work', 'The meeting starts at ten.', { ru: 'совещание', de: 'Besprechung', fr: 'réunion', nl: 'vergadering', ar: 'اجتماع' }),
    s('noun', 'an occasion when people come together', 'Their first meeting was by chance.', { ru: 'встреча', de: 'Treffen', fr: 'rencontre', nl: 'ontmoeting', ar: 'لقاء' }),
  ],
  open: [
    s('verb', 'to move something so it is no longer closed', 'Open the window, please.', { ru: 'открывать', de: 'öffnen', fr: 'ouvrir', nl: 'openen', ar: 'يفتح' }),
    s('adjective', 'ready for business', 'The shop is open until nine.', { ru: 'открыт', de: 'geöffnet', fr: 'ouvert', nl: 'open', ar: 'مفتوح' }),
    s('adjective', 'willing to consider new ideas', 'He is open to suggestions.', { ru: 'открытый (к идеям)', de: 'aufgeschlossen', fr: 'ouvert (d’esprit)', nl: 'openstaand', ar: 'منفتح' }),
  ],
  close: [
    s('verb', 'to shut something', 'Please close the door.', { ru: 'закрывать', de: 'schließen', fr: 'fermer', nl: 'sluiten', ar: 'يغلق' }),
    s('adjective', 'near in distance', 'The station is close to the hotel.', { ru: 'близкий', de: 'nah', fr: 'proche', nl: 'dichtbij', ar: 'قريب' }),
    s('adjective', 'knowing someone very well', 'They are close friends.', { ru: 'близкий (о людях)', de: 'eng befreundet', fr: 'proche (ami)', nl: 'hecht', ar: 'حميم' }),
  ],
  start: [
    s('verb', 'to begin doing something', 'We start at nine.', { ru: 'начинать', de: 'beginnen', fr: 'commencer', nl: 'beginnen', ar: 'يبدأ' }),
    s('verb', 'to make a machine begin working', 'The car will not start.', { ru: 'заводить', de: 'starten', fr: 'démarrer', nl: 'starten', ar: 'يشغّل' }),
  ],
  watch: [
    s('verb', 'to look at something for a while', 'We watched the match together.', { ru: 'смотреть', de: 'anschauen', fr: 'regarder', nl: 'kijken naar', ar: 'يشاهد' }),
    s('noun', 'a small clock worn on the wrist', 'My watch is five minutes fast.', { ru: 'наручные часы', de: 'Armbanduhr', fr: 'montre', nl: 'horloge', ar: 'ساعة يد' }),
  ],
  order: [
    s('noun', 'a request for goods or food', 'Your order will arrive on Friday.', { ru: 'заказ', de: 'Bestellung', fr: 'commande', nl: 'bestelling', ar: 'طلب' }),
    s('noun', 'the way things are arranged', 'Put the names in alphabetical order.', { ru: 'порядок', de: 'Reihenfolge', fr: 'ordre', nl: 'volgorde', ar: 'ترتيب' }),
    s('noun', 'an instruction that must be obeyed', 'The officer gave an order.', { ru: 'приказ', de: 'Befehl', fr: 'ordre (commandement)', nl: 'bevel', ar: 'أمر' }),
  ],
  match: [
    s('noun', 'a sports game between two sides', 'The match ended in a draw.', { ru: 'матч', de: 'Spiel', fr: 'match', nl: 'wedstrijd', ar: 'مباراة' }),
    s('noun', 'a small stick used to make fire', 'He lit the candle with a match.', { ru: 'спичка', de: 'Streichholz', fr: 'allumette', nl: 'lucifer', ar: 'عود ثقاب' }),
    s('verb', 'to go well together', 'That tie matches your shirt.', { ru: 'подходить', de: 'passen zu', fr: 'aller avec', nl: 'passen bij', ar: 'يتناسب' }),
  ],
  fine: [
    s('adjective', 'good enough; acceptable', 'Tuesday is fine for me.', { ru: 'нормально', de: 'in Ordnung', fr: 'très bien', nl: 'prima', ar: 'جيد' }),
    s('noun', 'money you pay as a punishment', 'He got a parking fine.', { ru: 'штраф', de: 'Geldstrafe', fr: 'amende', nl: 'boete', ar: 'غرامة' }),
    s('adjective', 'very thin or delicate', 'This is a fine thread.', { ru: 'тонкий', de: 'fein', fr: 'fin', nl: 'fijn', ar: 'رفيع' }),
  ],
  kind: [
    s('adjective', 'caring and friendly to others', 'It was very kind of you to help.', { ru: 'добрый', de: 'freundlich', fr: 'gentil', nl: 'aardig', ar: 'لطيف' }),
    s('noun', 'a type or sort of thing', 'What kind of music do you like?', { ru: 'вид', de: 'Art', fr: 'sorte', nl: 'soort', ar: 'نوع' }),
  ],
  mean: [
    s('verb', 'to have a particular sense', 'What does this word mean?', { ru: 'означать', de: 'bedeuten', fr: 'signifier', nl: 'betekenen', ar: 'يعني' }),
    s('verb', 'to intend to do something', 'I meant to call you yesterday.', { ru: 'намереваться', de: 'beabsichtigen', fr: 'avoir l’intention', nl: 'van plan zijn', ar: 'ينوي' }),
    s('adjective', 'unkind or cruel', 'That was a mean thing to say.', { ru: 'злой', de: 'gemein', fr: 'méchant', nl: 'gemeen', ar: 'لئيم' }),
  ],
  miss: [
    s('verb', 'to feel sad that someone is not there', 'I miss my family.', { ru: 'скучать', de: 'vermissen', fr: 'manquer à', nl: 'missen', ar: 'يفتقد' }),
    s('verb', 'to arrive too late for something', 'We missed the last train.', { ru: 'опоздать на', de: 'verpassen', fr: 'rater', nl: 'missen (trein)', ar: 'يفوته' }),
  ],
  free: [
    s('adjective', 'costing no money', 'Entry is free on Sundays.', { ru: 'бесплатный', de: 'kostenlos', fr: 'gratuit', nl: 'gratis', ar: 'مجاني' }),
    s('adjective', 'not busy', 'Are you free this evening?', { ru: 'свободный (о времени)', de: 'frei (Zeit)', fr: 'libre', nl: 'vrij', ar: 'متفرغ' }),
    s('adjective', 'not controlled or imprisoned', 'The prisoners were set free.', { ru: 'свободный', de: 'frei', fr: 'libre (non captif)', nl: 'vrij (niet gevangen)', ar: 'حر' }),
  ],
  hard: [
    s('adjective', 'difficult to do', 'It was a hard exam.', { ru: 'трудный', de: 'schwierig', fr: 'difficile', nl: 'moeilijk', ar: 'صعب' }),
    s('adjective', 'firm; not soft', 'The bread has gone hard.', { ru: 'твёрдый', de: 'hart', fr: 'dur', nl: 'hard', ar: 'قاسٍ' }),
    s('adverb', 'with a lot of effort', 'She works hard.', { ru: 'усердно', de: 'hart (angestrengt)', fr: 'dur (avec effort)', nl: 'hard (ijverig)', ar: 'بجد' }),
  ],
  run: [
    s('verb', 'to move quickly on foot', 'He runs every morning.', { ru: 'бегать', de: 'laufen', fr: 'courir', nl: 'rennen', ar: 'يجري' }),
    s('verb', 'to manage a business or organisation', 'She runs a small hotel.', { ru: 'управлять', de: 'leiten', fr: 'gérer', nl: 'leiden', ar: 'يدير' }),
    s('verb', 'to operate; to be working', 'The engine is running.', { ru: 'работать (о механизме)', de: 'laufen (Maschine)', fr: 'tourner (moteur)', nl: 'draaien (motor)', ar: 'يعمل (محرك)' }),
  ],
  point: [
    s('noun', 'the main idea someone is making', 'That is a good point.', { ru: 'мысль, довод', de: 'Punkt (Argument)', fr: 'argument', nl: 'punt (argument)', ar: 'نقطة (فكرة)' }),
    s('noun', 'a unit of score in a game', 'They won by three points.', { ru: 'очко', de: 'Punkt (Spiel)', fr: 'point (score)', nl: 'punt (score)', ar: 'نقطة (تسجيل)' }),
    s('verb', 'to show something with your finger', 'She pointed at the map.', { ru: 'указывать', de: 'zeigen', fr: 'montrer du doigt', nl: 'wijzen', ar: 'يشير' }),
  ],
  set: [
    s('verb', 'to put something in a place or state', 'Set the box on the table.', { ru: 'ставить', de: 'stellen', fr: 'poser', nl: 'zetten', ar: 'يضع' }),
    s('noun', 'a group of things that belong together', 'A set of tools.', { ru: 'набор', de: 'Satz', fr: 'ensemble', nl: 'set', ar: 'مجموعة' }),
    s('verb', 'to go down below the horizon', 'The sun sets at seven.', { ru: 'садиться (о солнце)', de: 'untergehen', fr: 'se coucher (soleil)', nl: 'ondergaan', ar: 'تغرب' }),
  ],
  turn: [
    s('verb', 'to move in a different direction', 'Turn left after the bridge.', { ru: 'поворачивать', de: 'abbiegen', fr: 'tourner', nl: 'afslaan', ar: 'ينعطف' }),
    s('noun', 'the time when it is your chance to do something', 'It is your turn to speak.', { ru: 'очередь', de: 'Reihe (an der Reihe)', fr: 'tour', nl: 'beurt', ar: 'دور' }),
    s('verb', 'to become different', 'The leaves turn yellow in autumn.', { ru: 'становиться', de: 'werden', fr: 'devenir', nl: 'worden', ar: 'يصبح' }),
  ],
  bank: [
    s('noun', 'a place that keeps and lends money', 'I need to go to the bank.', { ru: 'банк', de: 'Bank (Geld)', fr: 'banque', nl: 'bank (geld)', ar: 'مصرف' }),
    s('noun', 'the land along the side of a river', 'They sat on the river bank.', { ru: 'берег', de: 'Ufer', fr: 'rive', nl: 'oever', ar: 'ضفة' }),
  ],
  interest: [
    s('noun', 'the wish to know more about something', 'She has an interest in history.', { ru: 'интерес', de: 'Interesse', fr: 'intérêt', nl: 'interesse', ar: 'اهتمام' }),
    s('noun', 'money a bank pays or charges for using money', 'The loan has low interest.', { ru: 'проценты', de: 'Zinsen', fr: 'intérêts', nl: 'rente', ar: 'فائدة' }),
  ],
  charge: [
    s('verb', 'to ask a price for something', 'They charge ten euros for delivery.', { ru: 'брать плату', de: 'berechnen', fr: 'facturer', nl: 'in rekening brengen', ar: 'يتقاضى' }),
    s('verb', 'to put electricity into a battery', 'I need to charge my phone.', { ru: 'заряжать', de: 'aufladen', fr: 'recharger', nl: 'opladen', ar: 'يشحن' }),
    s('noun', 'an official accusation of a crime', 'He faces a serious charge.', { ru: 'обвинение', de: 'Anklage', fr: 'accusation', nl: 'aanklacht', ar: 'تهمة' }),
  ],
  check: [
    s('verb', 'to look at something to make sure it is right', 'Check your answers before you finish.', { ru: 'проверять', de: 'überprüfen', fr: 'vérifier', nl: 'controleren', ar: 'يتحقق' }),
    s('noun', 'an examination to test something', 'The car needs a safety check.', { ru: 'проверка', de: 'Kontrolle', fr: 'contrôle', nl: 'controle', ar: 'فحص' }),
  ],
  class: [
    s('noun', 'a group of students taught together', 'There are twelve people in my class.', { ru: 'класс, группа', de: 'Klasse', fr: 'classe', nl: 'klas', ar: 'صف' }),
    s('noun', 'a lesson', 'I have an English class at four.', { ru: 'занятие', de: 'Unterrichtsstunde', fr: 'cours', nl: 'les', ar: 'حصة' }),
    s('noun', 'a level of quality or service', 'They travel first class.', { ru: 'класс (уровень)', de: 'Klasse (Kategorie)', fr: 'classe (catégorie)', nl: 'klasse (categorie)', ar: 'درجة' }),
  ],
  case: [
    s('noun', 'a particular situation or example', 'In that case, we should wait.', { ru: 'случай', de: 'Fall', fr: 'cas', nl: 'geval', ar: 'حالة' }),
    s('noun', 'a container for carrying things', 'Put the camera back in its case.', { ru: 'футляр', de: 'Etui', fr: 'étui', nl: 'koffer', ar: 'حقيبة' }),
    s('noun', 'a matter decided in court', 'The case goes to trial in May.', { ru: 'дело (судебное)', de: 'Rechtsfall', fr: 'affaire', nl: 'zaak', ar: 'قضية' }),
  ],
  draw: [
    s('verb', 'to make a picture with a pen or pencil', 'She drew a map for us.', { ru: 'рисовать', de: 'zeichnen', fr: 'dessiner', nl: 'tekenen', ar: 'يرسم' }),
    s('verb', 'to pull something towards you', 'He drew the curtains.', { ru: 'задёргивать, тянуть', de: 'ziehen', fr: 'tirer', nl: 'trekken', ar: 'يسحب' }),
    s('noun', 'a game that ends with equal scores', 'The match ended in a draw.', { ru: 'ничья', de: 'Unentschieden', fr: 'match nul', nl: 'gelijkspel', ar: 'تعادل' }),
  ],
  drive: [
    s('verb', 'to control a car', 'He drives to work every day.', { ru: 'водить', de: 'fahren', fr: 'conduire', nl: 'rijden', ar: 'يقود' }),
    s('noun', 'a journey in a car', "It's a two-hour drive.", { ru: 'поездка', de: 'Fahrt', fr: 'trajet', nl: 'rit', ar: 'رحلة بالسيارة' }),
    s('noun', 'strong motivation to succeed', 'She has real drive.', { ru: 'напор, энергия', de: 'Antrieb', fr: 'motivation', nl: 'gedrevenheid', ar: 'دافع' }),
  ],
  face: [
    s('noun', 'the front of the head', 'He has a friendly face.', { ru: 'лицо', de: 'Gesicht', fr: 'visage', nl: 'gezicht', ar: 'وجه' }),
    s('verb', 'to deal with a difficult situation', 'We face a serious problem.', { ru: 'сталкиваться с', de: 'gegenüberstehen', fr: 'faire face à', nl: 'het hoofd bieden', ar: 'يواجه' }),
    s('verb', 'to be turned towards something', 'The house faces the sea.', { ru: 'выходить на', de: 'blicken auf', fr: 'donner sur', nl: 'uitkijken op', ar: 'يطل على' }),
  ],
  fair: [
    s('adjective', 'treating everyone equally', 'That is not a fair decision.', { ru: 'справедливый', de: 'gerecht', fr: 'juste', nl: 'eerlijk', ar: 'عادل' }),
    s('adjective', 'light in colour, of hair or skin', 'She has fair hair.', { ru: 'светлый (о волосах)', de: 'blond', fr: 'blond', nl: 'blond', ar: 'أشقر' }),
    s('noun', 'a large event where companies show products', 'We met at a trade fair.', { ru: 'ярмарка', de: 'Messe', fr: 'foire', nl: 'beurs', ar: 'معرض' }),
  ],
  fall: [
    s('verb', 'to drop down to the ground', 'Be careful not to fall.', { ru: 'падать', de: 'fallen', fr: 'tomber', nl: 'vallen', ar: 'يسقط' }),
    s('verb', 'to become lower in amount', 'Prices fell last month.', { ru: 'снижаться', de: 'sinken', fr: 'baisser', nl: 'dalen', ar: 'ينخفض' }),
  ],
  field: [
    s('noun', 'an area of land for crops or animals', 'The cows are in the field.', { ru: 'поле', de: 'Feld', fr: 'champ', nl: 'veld', ar: 'حقل' }),
    s('noun', 'an area of study or work', 'She is an expert in her field.', { ru: 'область (знаний)', de: 'Fachgebiet', fr: 'domaine', nl: 'vakgebied', ar: 'مجال' }),
  ],
  figure: [
    s('noun', 'a number or amount', 'Sales reached a record figure.', { ru: 'цифра', de: 'Zahl', fr: 'chiffre', nl: 'cijfer', ar: 'رقم' }),
    s('noun', 'the shape of a person’s body', 'She has a slim figure.', { ru: 'фигура', de: 'Figur', fr: 'silhouette', nl: 'figuur', ar: 'قوام' }),
  ],
  fire: [
    s('noun', 'flames that burn and give heat', 'They sat by the fire.', { ru: 'огонь', de: 'Feuer', fr: 'feu', nl: 'vuur', ar: 'نار' }),
    s('verb', 'to make someone leave their job', 'He was fired last week.', { ru: 'увольнять', de: 'entlassen', fr: 'licencier', nl: 'ontslaan', ar: 'يفصل' }),
  ],
  fit: [
    s('verb', 'to be the right size', 'These shoes do not fit me.', { ru: 'подходить по размеру', de: 'passen', fr: 'aller (taille)', nl: 'passen', ar: 'يناسب المقاس' }),
    s('adjective', 'healthy and strong', 'He keeps fit by running.', { ru: 'в хорошей форме', de: 'fit', fr: 'en forme', nl: 'fit', ar: 'لائق بدنيًا' }),
  ],
  form: [
    s('noun', 'a document with spaces to fill in', 'Please complete this form.', { ru: 'бланк', de: 'Formular', fr: 'formulaire', nl: 'formulier', ar: 'استمارة' }),
    s('noun', 'the shape or type of something', 'Water in the form of ice.', { ru: 'форма', de: 'Form', fr: 'forme', nl: 'vorm', ar: 'شكل' }),
    s('verb', 'to create or start something', 'They formed a new company.', { ru: 'образовывать', de: 'gründen', fr: 'former', nl: 'vormen', ar: 'يشكّل' }),
  ],
  ground: [
    s('noun', 'the surface of the earth', 'The ground is wet after the rain.', { ru: 'земля', de: 'Boden', fr: 'sol', nl: 'grond', ar: 'أرض' }),
    s('noun', 'a reason for something', 'They had good grounds for the complaint.', { ru: 'основание', de: 'Grund', fr: 'motif', nl: 'reden', ar: 'مبرر' }),
  ],
  hold: [
    s('verb', 'to keep something in your hands', 'Hold the baby carefully.', { ru: 'держать', de: 'halten', fr: 'tenir', nl: 'vasthouden', ar: 'يمسك' }),
    s('verb', 'to organise an event', 'They hold a meeting every Monday.', { ru: 'проводить', de: 'abhalten', fr: 'tenir (une réunion)', nl: 'houden', ar: 'يعقد' }),
    s('verb', 'to have space for a number of things', 'The hall holds 200 people.', { ru: 'вмещать', de: 'fassen', fr: 'contenir', nl: 'bevatten', ar: 'يتسع لـ' }),
  ],
  issue: [
    s('noun', 'an important problem or subject', 'Climate change is a global issue.', { ru: 'вопрос, проблема', de: 'Thema', fr: 'question', nl: 'kwestie', ar: 'قضية' }),
    s('noun', 'one edition of a magazine', 'The March issue is out.', { ru: 'выпуск', de: 'Ausgabe', fr: 'numéro', nl: 'nummer', ar: 'عدد' }),
    s('verb', 'to officially give out something', 'The bank issued a new card.', { ru: 'выдавать', de: 'ausstellen', fr: 'délivrer', nl: 'uitgeven', ar: 'يُصدر' }),
  ],
  lead: [
    s('verb', 'to guide a group of people', 'She leads the design team.', { ru: 'руководить', de: 'führen', fr: 'diriger', nl: 'leiden', ar: 'يقود' }),
    s('verb', 'to go to a place, of a road', 'This path leads to the beach.', { ru: 'вести (о дороге)', de: 'führen (Weg)', fr: 'mener', nl: 'leiden naar', ar: 'يؤدي إلى' }),
    s('noun', 'the first position in a race or contest', 'They are in the lead.', { ru: 'лидерство', de: 'Führung', fr: 'tête (course)', nl: 'leiding', ar: 'الصدارة' }),
  ],
  line: [
    s('noun', 'a long thin mark', 'Draw a line under the title.', { ru: 'линия', de: 'Linie', fr: 'ligne', nl: 'lijn', ar: 'خط' }),
    s('noun', 'a row of people waiting', 'There was a long line at the door.', { ru: 'очередь', de: 'Schlange', fr: 'file d’attente', nl: 'rij', ar: 'طابور' }),
    s('noun', 'a telephone connection', 'The line is busy.', { ru: 'линия связи', de: 'Leitung', fr: 'ligne (téléphone)', nl: 'lijn (telefoon)', ar: 'خط هاتف' }),
  ],
  mark: [
    s('noun', 'a small spot or stain', 'There is a mark on your shirt.', { ru: 'пятно', de: 'Fleck', fr: 'tache', nl: 'vlek', ar: 'بقعة' }),
    s('noun', 'a score given for work', 'She got a high mark in the test.', { ru: 'оценка', de: 'Note', fr: 'note', nl: 'cijfer', ar: 'درجة' }),
    s('verb', 'to correct and grade work', 'The teacher marks the essays.', { ru: 'проверять работы', de: 'benoten', fr: 'corriger', nl: 'nakijken', ar: 'يصحح' }),
  ],
  note: [
    s('noun', 'a short written message', 'She left a note on the table.', { ru: 'записка', de: 'Notiz', fr: 'mot (message)', nl: 'briefje', ar: 'مذكرة' }),
    s('noun', 'a piece of paper money', 'A twenty-euro note.', { ru: 'купюра', de: 'Geldschein', fr: 'billet', nl: 'bankbiljet', ar: 'ورقة نقدية' }),
    s('verb', 'to notice something', 'Please note the change of address.', { ru: 'отмечать', de: 'beachten', fr: 'noter', nl: 'opmerken', ar: 'يلاحظ' }),
  ],
  part: [
    s('noun', 'a piece of something bigger', 'This is the best part of the book.', { ru: 'часть', de: 'Teil', fr: 'partie', nl: 'deel', ar: 'جزء' }),
    s('noun', 'a role in a play or film', 'He played the part of the doctor.', { ru: 'роль', de: 'Rolle', fr: 'rôle', nl: 'rol', ar: 'دور' }),
  ],
  party: [
    s('noun', 'a social event with food and music', 'We are having a party on Saturday.', { ru: 'вечеринка', de: 'Party', fr: 'fête', nl: 'feest', ar: 'حفلة' }),
    s('noun', 'a political organisation', 'Which party did you vote for?', { ru: 'партия', de: 'Partei', fr: 'parti', nl: 'partij', ar: 'حزب' }),
  ],
  pass: [
    s('verb', 'to go by someone or something', 'We passed the church on the way.', { ru: 'проходить мимо', de: 'vorbeigehen', fr: 'passer devant', nl: 'passeren', ar: 'يمر بـ' }),
    s('verb', 'to succeed in an exam', 'She passed the exam easily.', { ru: 'сдать (экзамен)', de: 'bestehen', fr: 'réussir', nl: 'slagen', ar: 'ينجح' }),
    s('verb', 'to give something to someone', 'Pass me the salt, please.', { ru: 'передать', de: 'reichen', fr: 'passer', nl: 'aangeven', ar: 'يمرر' }),
  ],
  place: [
    s('noun', 'a particular position or area', 'This is a quiet place to study.', { ru: 'место', de: 'Ort', fr: 'endroit', nl: 'plek', ar: 'مكان' }),
    s('verb', 'to put something somewhere', 'Place the cup on the shelf.', { ru: 'помещать', de: 'platzieren', fr: 'placer', nl: 'plaatsen', ar: 'يضع' }),
  ],
  plant: [
    s('noun', 'a living thing that grows in soil', 'Water the plants once a week.', { ru: 'растение', de: 'Pflanze', fr: 'plante', nl: 'plant', ar: 'نبتة' }),
    s('noun', 'a factory', 'He works at a car plant.', { ru: 'завод', de: 'Werk', fr: 'usine', nl: 'fabriek', ar: 'مصنع' }),
    s('verb', 'to put a seed in the ground', 'We planted a tree.', { ru: 'сажать', de: 'pflanzen', fr: 'planter', nl: 'planten', ar: 'يزرع' }),
  ],
  present: [
    s('noun', 'a gift', 'She gave me a birthday present.', { ru: 'подарок', de: 'Geschenk', fr: 'cadeau', nl: 'cadeau', ar: 'هدية' }),
    s('adjective', 'in a place; not absent', 'Everyone was present at the meeting.', { ru: 'присутствующий', de: 'anwesend', fr: 'présent', nl: 'aanwezig', ar: 'حاضر' }),
    s('verb', 'to show or explain something formally', 'She presented the results.', { ru: 'представлять', de: 'präsentieren', fr: 'présenter', nl: 'presenteren', ar: 'يعرض' }),
  ],
  press: [
    s('verb', 'to push something firmly', 'Press the green button.', { ru: 'нажимать', de: 'drücken', fr: 'appuyer', nl: 'drukken', ar: 'يضغط' }),
    s('noun', 'newspapers and journalists', 'The press reported the story.', { ru: 'пресса', de: 'Presse', fr: 'presse', nl: 'pers', ar: 'صحافة' }),
  ],
  raise: [
    s('verb', 'to lift something up', 'Raise your hand if you know.', { ru: 'поднимать', de: 'heben', fr: 'lever', nl: 'opsteken', ar: 'يرفع' }),
    s('verb', 'to increase an amount', 'They raised the price again.', { ru: 'повышать', de: 'erhöhen', fr: 'augmenter', nl: 'verhogen', ar: 'يزيد' }),
    s('verb', 'to bring up children', 'She raised three children alone.', { ru: 'воспитывать', de: 'großziehen', fr: 'élever', nl: 'opvoeden', ar: 'يربي' }),
  ],
  rate: [
    s('noun', 'a speed or frequency', 'The birth rate is falling.', { ru: 'показатель', de: 'Rate', fr: 'taux', nl: 'percentage', ar: 'معدل' }),
    s('noun', 'a fixed price for a service', 'The hourly rate is twenty euros.', { ru: 'ставка', de: 'Satz', fr: 'tarif', nl: 'tarief', ar: 'سعر الخدمة' }),
    s('verb', 'to judge how good something is', 'Customers rate the app highly.', { ru: 'оценивать', de: 'bewerten', fr: 'évaluer', nl: 'beoordelen', ar: 'يقيّم' }),
  ],
  record: [
    s('noun', 'the best result ever achieved', 'She broke the world record.', { ru: 'рекорд', de: 'Rekord', fr: 'record', nl: 'record', ar: 'رقم قياسي' }),
    s('noun', 'written information kept for later', 'Keep a record of your expenses.', { ru: 'запись, учёт', de: 'Aufzeichnung', fr: 'relevé', nl: 'registratie', ar: 'سجل' }),
    s('verb', 'to store sound or video', 'They recorded the interview.', { ru: 'записывать', de: 'aufnehmen', fr: 'enregistrer', nl: 'opnemen', ar: 'يسجّل' }),
  ],
  rest: [
    s('noun', 'a period of relaxing', 'You need a rest after the trip.', { ru: 'отдых', de: 'Ruhe', fr: 'repos', nl: 'rust', ar: 'راحة' }),
    s('noun', 'the part that is left', 'I will read the rest tomorrow.', { ru: 'остальное', de: 'Rest', fr: 'reste', nl: 'rest', ar: 'الباقي' }),
  ],
  ring: [
    s('noun', 'a circle of metal worn on a finger', 'She wears a gold ring.', { ru: 'кольцо', de: 'Ring', fr: 'bague', nl: 'ring', ar: 'خاتم' }),
    s('verb', 'to make a bell sound', 'The phone is ringing.', { ru: 'звонить', de: 'klingeln', fr: 'sonner', nl: 'rinkelen', ar: 'يرن' }),
  ],
  rock: [
    s('noun', 'hard stone', 'The path was covered in rocks.', { ru: 'камень', de: 'Fels', fr: 'roche', nl: 'rots', ar: 'صخر' }),
    s('noun', 'a style of loud popular music', 'He listens to rock.', { ru: 'рок (музыка)', de: 'Rockmusik', fr: 'rock', nl: 'rockmuziek', ar: 'موسيقى الروك' }),
  ],
  rule: [
    s('noun', 'an instruction about what is allowed', 'Read the rules before you play.', { ru: 'правило', de: 'Regel', fr: 'règle', nl: 'regel', ar: 'قاعدة' }),
    s('verb', 'to govern a country', 'The queen ruled for forty years.', { ru: 'править', de: 'regieren', fr: 'gouverner', nl: 'regeren', ar: 'يحكم' }),
  ],
  save: [
    s('verb', 'to keep money for later', 'They save for a holiday every year.', { ru: 'копить', de: 'sparen', fr: 'économiser', nl: 'sparen', ar: 'يدّخر' }),
    s('verb', 'to rescue someone from danger', 'He saved the child from the fire.', { ru: 'спасать', de: 'retten', fr: 'sauver', nl: 'redden', ar: 'ينقذ' }),
    s('verb', 'to store a file on a computer', 'Save the document before closing.', { ru: 'сохранять', de: 'speichern', fr: 'enregistrer', nl: 'opslaan', ar: 'يحفظ' }),
  ],
  sense: [
    s('noun', 'the meaning of a word', 'In this sense the word is negative.', { ru: 'значение', de: 'Bedeutung', fr: 'sens', nl: 'betekenis', ar: 'معنى' }),
    s('noun', 'one of the five abilities like sight or smell', 'Dogs have a good sense of smell.', { ru: 'чувство (орган)', de: 'Sinn', fr: 'sens (odorat, vue)', nl: 'zintuig', ar: 'حاسة' }),
    s('noun', 'good judgement', 'She had the sense to ask first.', { ru: 'здравый смысл', de: 'Vernunft', fr: 'bon sens', nl: 'verstand', ar: 'حكمة' }),
  ],
  share: [
    s('verb', 'to use something together with others', 'We share an office.', { ru: 'делить', de: 'teilen', fr: 'partager', nl: 'delen', ar: 'يتشارك' }),
    s('noun', 'a part of a company you can own', 'He bought shares in the company.', { ru: 'акция', de: 'Aktie', fr: 'action (bourse)', nl: 'aandeel', ar: 'سهم' }),
  ],
  sign: [
    s('noun', 'a board with information on it', 'The sign says "no parking".', { ru: 'знак, табличка', de: 'Schild', fr: 'panneau', nl: 'bord', ar: 'لافتة' }),
    s('verb', 'to write your name on a document', 'Please sign at the bottom.', { ru: 'подписывать', de: 'unterschreiben', fr: 'signer', nl: 'ondertekenen', ar: 'يوقّع' }),
    s('noun', 'evidence that something is happening', 'A rash can be a sign of illness.', { ru: 'признак', de: 'Anzeichen', fr: 'signe', nl: 'teken', ar: 'علامة' }),
  ],
  sound: [
    s('noun', 'something you hear', 'I heard a strange sound.', { ru: 'звук', de: 'Geräusch', fr: 'son', nl: 'geluid', ar: 'صوت' }),
    s('verb', 'to seem a certain way when described', 'That sounds like a good plan.', { ru: 'звучать (казаться)', de: 'klingen', fr: 'sembler', nl: 'klinken', ar: 'يبدو' }),
  ],
  space: [
    s('noun', 'an empty area', 'Is there space for one more chair?', { ru: 'место', de: 'Platz', fr: 'place', nl: 'ruimte', ar: 'مساحة' }),
    s('noun', 'the universe beyond the earth', 'They sent a rocket into space.', { ru: 'космос', de: 'Weltraum', fr: 'espace', nl: 'ruimte (heelal)', ar: 'فضاء' }),
  ],
  stand: [
    s('verb', 'to be on your feet', 'She stood by the window.', { ru: 'стоять', de: 'stehen', fr: 'être debout', nl: 'staan', ar: 'يقف' }),
    s('verb', 'to accept or bear something', 'I cannot stand the noise.', { ru: 'выносить, терпеть', de: 'ertragen', fr: 'supporter', nl: 'verdragen', ar: 'يتحمل' }),
  ],
  state: [
    s('noun', 'the condition something is in', 'The house is in a poor state.', { ru: 'состояние', de: 'Zustand', fr: 'état', nl: 'staat (toestand)', ar: 'حالة' }),
    s('noun', 'a country or part of one', 'He works for the state.', { ru: 'государство', de: 'Staat', fr: 'État', nl: 'staat (land)', ar: 'دولة' }),
    s('verb', 'to say something formally', 'The report states the facts clearly.', { ru: 'заявлять', de: 'angeben', fr: 'déclarer', nl: 'verklaren', ar: 'يصرّح' }),
  ],
  step: [
    s('noun', 'one movement of the foot when walking', 'Take one step forward.', { ru: 'шаг', de: 'Schritt', fr: 'pas', nl: 'stap', ar: 'خطوة' }),
    s('noun', 'a stage in a process', 'The first step is to register.', { ru: 'этап', de: 'Schritt (Phase)', fr: 'étape', nl: 'stap (fase)', ar: 'مرحلة' }),
    s('noun', 'a surface you climb on a staircase', 'Mind the wet steps.', { ru: 'ступенька', de: 'Stufe', fr: 'marche', nl: 'trede', ar: 'درجة سلم' }),
  ],
  store: [
    s('noun', 'a shop', 'The store closes at nine.', { ru: 'магазин', de: 'Geschäft', fr: 'magasin', nl: 'winkel', ar: 'متجر' }),
    s('verb', 'to keep something for later use', 'We store the files on a server.', { ru: 'хранить', de: 'speichern', fr: 'stocker', nl: 'opslaan', ar: 'يخزّن' }),
  ],
  subject: [
    s('noun', 'an area of study at school', 'Maths is my favourite subject.', { ru: 'предмет (учебный)', de: 'Schulfach', fr: 'matière', nl: 'vak', ar: 'مادة دراسية' }),
    s('noun', 'what something is about', 'Let us return to the subject.', { ru: 'тема', de: 'Thema', fr: 'sujet', nl: 'onderwerp', ar: 'موضوع' }),
  ],
  term: [
    s('noun', 'a word or expression', '"Bandwidth" is a technical term.', { ru: 'термин', de: 'Fachbegriff', fr: 'terme', nl: 'term', ar: 'مصطلح' }),
    s('noun', 'a part of the school year', 'The autumn term starts in September.', { ru: 'семестр', de: 'Semester', fr: 'trimestre', nl: 'trimester', ar: 'فصل دراسي' }),
    s('noun', 'a condition in an agreement', 'Read the terms of the contract.', { ru: 'условие', de: 'Bedingung', fr: 'condition', nl: 'voorwaarde', ar: 'شرط' }),
  ],
  test: [
    s('noun', 'a set of questions to measure knowledge', 'We have a test on Friday.', { ru: 'тест', de: 'Test', fr: 'test', nl: 'toets', ar: 'اختبار' }),
    s('verb', 'to try something to see if it works', 'They tested the new system.', { ru: 'испытывать', de: 'testen', fr: 'tester', nl: 'testen', ar: 'يختبر' }),
  ],
  touch: [
    s('verb', 'to put your hand on something', 'Do not touch the screen.', { ru: 'трогать', de: 'berühren', fr: 'toucher', nl: 'aanraken', ar: 'يلمس' }),
    s('noun', 'contact or communication with someone', 'Keep in touch!', { ru: 'связь (контакт)', de: 'Kontakt', fr: 'contact', nl: 'contact', ar: 'تواصل' }),
  ],
  train: [
    s('noun', 'a vehicle that runs on rails', 'The train leaves from platform two.', { ru: 'поезд', de: 'Zug', fr: 'train', nl: 'trein', ar: 'قطار' }),
    s('verb', 'to practise or teach a skill', 'He trains new staff.', { ru: 'обучать', de: 'schulen', fr: 'former', nl: 'opleiden', ar: 'يدرّب' }),
  ],
  treat: [
    s('verb', 'to behave towards someone in a way', 'They treat their staff well.', { ru: 'обращаться с', de: 'behandeln', fr: 'traiter', nl: 'behandelen', ar: 'يعامل' }),
    s('verb', 'to give medical care', 'The doctor treated the infection.', { ru: 'лечить', de: 'behandeln (medizinisch)', fr: 'soigner', nl: 'behandelen (medisch)', ar: 'يعالج' }),
    s('noun', 'something nice you give as a pleasure', 'Dinner is my treat.', { ru: 'угощение', de: 'Leckerbissen', fr: 'petit plaisir', nl: 'traktatie', ar: 'ضيافة' }),
  ],
  type: [
    s('noun', 'a group of things that are similar', 'What type of car is it?', { ru: 'тип', de: 'Typ', fr: 'type', nl: 'type', ar: 'نوع' }),
    s('verb', 'to write using a keyboard', 'She types very fast.', { ru: 'печатать', de: 'tippen', fr: 'taper', nl: 'typen', ar: 'يكتب على لوحة المفاتيح' }),
  ],
  value: [
    s('noun', 'how much something is worth', 'The value of the house has risen.', { ru: 'стоимость', de: 'Wert', fr: 'valeur', nl: 'waarde', ar: 'قيمة' }),
    s('noun', 'a belief about what is important', 'Honesty is a family value.', { ru: 'ценность', de: 'Wertvorstellung', fr: 'valeur (morale)', nl: 'waarde (norm)', ar: 'قيمة أخلاقية' }),
  ],
  view: [
    s('noun', 'what you can see from a place', 'The room has a sea view.', { ru: 'вид', de: 'Aussicht', fr: 'vue', nl: 'uitzicht', ar: 'إطلالة' }),
    s('noun', 'an opinion', 'In my view, we should wait.', { ru: 'мнение', de: 'Ansicht', fr: 'avis', nl: 'mening', ar: 'رأي' }),
  ],
  way: [
    s('noun', 'a method of doing something', 'This is the fastest way to learn.', { ru: 'способ', de: 'Art und Weise', fr: 'façon', nl: 'manier', ar: 'طريقة' }),
    s('noun', 'a route or direction', 'Do you know the way to the station?', { ru: 'дорога, путь', de: 'Weg', fr: 'chemin', nl: 'weg', ar: 'طريق' }),
  ],
  will: [
    s('verb', 'used to talk about the future', 'She will call you tomorrow.', { ru: 'вспомогательный глагол будущего', de: 'wird (Futur)', fr: 'auxiliaire du futur', nl: 'zal', ar: 'سوف' }),
    s('noun', 'determination to do something', 'He has a strong will.', { ru: 'воля', de: 'Wille', fr: 'volonté', nl: 'wilskracht', ar: 'إرادة' }),
    s('noun', 'a legal document about your property after death', 'She left the house to her son in her will.', { ru: 'завещание', de: 'Testament', fr: 'testament', nl: 'testament', ar: 'وصية' }),
  ],
  season: [
    s('noun', 'one of the four parts of the year', 'Autumn is my favourite season.', { ru: 'время года', de: 'Jahreszeit', fr: 'saison', nl: 'seizoen', ar: 'فصل من السنة' }),
    s('noun', 'the period when an activity happens', 'The football season starts in August.', { ru: 'сезон', de: 'Saison', fr: 'saison (sportive)', nl: 'seizoen (sport)', ar: 'موسم' }),
  ],
  half: [
    s('noun', 'one of two equal parts', 'Cut the apple in half.', { ru: 'половина', de: 'Hälfte', fr: 'moitié', nl: 'helft', ar: 'نصف' }),
    s('noun', 'one of two periods in a match', 'They scored in the second half.', { ru: 'тайм', de: 'Halbzeit', fr: 'mi-temps', nl: 'helft (wedstrijd)', ar: 'شوط' }),
  ],
  quarter: [
    s('noun', 'one of four equal parts', 'A quarter of the class was absent.', { ru: 'четверть', de: 'Viertel', fr: 'quart', nl: 'kwart', ar: 'ربع' }),
    s('noun', 'a three-month business period', 'Sales rose in the third quarter.', { ru: 'квартал (год)', de: 'Quartal', fr: 'trimestre', nl: 'kwartaal', ar: 'ربع سنة' }),
    s('noun', 'a district of a city', 'They live in the old quarter.', { ru: 'квартал (район)', de: 'Stadtviertel', fr: 'quartier', nl: 'wijk', ar: 'حي' }),
  ],
  capital: [
    s('noun', 'the main city of a country', 'Paris is the capital of France.', { ru: 'столица', de: 'Hauptstadt', fr: 'capitale', nl: 'hoofdstad', ar: 'عاصمة' }),
    s('noun', 'money used to start a business', 'They need capital to expand.', { ru: 'капитал', de: 'Kapital', fr: 'capital', nl: 'kapitaal', ar: 'رأس مال' }),
    s('noun', 'a large form of a letter', 'Write your name in capitals.', { ru: 'заглавная буква', de: 'Großbuchstabe', fr: 'majuscule', nl: 'hoofdletter', ar: 'حرف كبير' }),
  ],
  board: [
    s('noun', 'a flat piece of wood or plastic', 'Write it on the board.', { ru: 'доска', de: 'Tafel', fr: 'tableau', nl: 'bord', ar: 'لوح' }),
    s('noun', 'the group that manages a company', 'The board approved the plan.', { ru: 'совет директоров', de: 'Vorstand', fr: 'conseil d’administration', nl: 'bestuur', ar: 'مجلس إدارة' }),
    s('verb', 'to get on a plane, ship or train', 'We board at gate twelve.', { ru: 'садиться (на борт)', de: 'einsteigen', fr: 'embarquer', nl: 'aan boord gaan', ar: 'يصعد إلى الطائرة' }),
  ],
  bill: [
    s('noun', 'a document showing what you owe', 'Could we have the bill, please?', { ru: 'счёт', de: 'Rechnung', fr: 'addition', nl: 'rekening', ar: 'فاتورة' }),
    s('noun', 'a proposed new law', 'Parliament debated the bill.', { ru: 'законопроект', de: 'Gesetzentwurf', fr: 'projet de loi', nl: 'wetsvoorstel', ar: 'مشروع قانون' }),
  ],
  cover: [
    s('verb', 'to put something over another thing', 'Cover the pan with a lid.', { ru: 'накрывать', de: 'abdecken', fr: 'couvrir', nl: 'bedekken', ar: 'يغطي' }),
    s('noun', 'the outside of a book', 'The cover shows a red house.', { ru: 'обложка', de: 'Einband', fr: 'couverture', nl: 'omslag', ar: 'غلاف' }),
    s('verb', 'to include or deal with a topic', 'The course covers grammar and writing.', { ru: 'охватывать', de: 'behandeln', fr: 'couvrir (un sujet)', nl: 'behandelen', ar: 'يغطي موضوعًا' }),
  ],
  degree: [
    s('noun', 'a unit for measuring temperature or angles', 'It is thirty degrees outside.', { ru: 'градус', de: 'Grad', fr: 'degré', nl: 'graad', ar: 'درجة حرارة' }),
    s('noun', 'a qualification from a university', 'She has a degree in economics.', { ru: 'учёная степень', de: 'akademischer Abschluss', fr: 'diplôme universitaire', nl: 'universitair diploma', ar: 'شهادة جامعية' }),
  ],
  offer: [
    s('verb', 'to say you are willing to give something', 'He offered to drive us home.', { ru: 'предлагать', de: 'anbieten', fr: 'proposer', nl: 'aanbieden', ar: 'يعرض' }),
    s('noun', 'a price or deal proposed to you', 'They made us a good offer.', { ru: 'предложение (цена)', de: 'Angebot', fr: 'offre', nl: 'aanbod', ar: 'عرض سعر' }),
  ],
  patient: [
    s('adjective', 'able to wait without getting annoyed', 'Be patient — the bus will come.', { ru: 'терпеливый', de: 'geduldig', fr: 'patient', nl: 'geduldig', ar: 'صبور' }),
    s('noun', 'a person receiving medical care', 'The doctor saw twelve patients.', { ru: 'пациент', de: 'Patient', fr: 'patient (malade)', nl: 'patiënt', ar: 'مريض' }),
  ],
  sleep: [
    s('verb', 'to rest with your eyes closed', 'I slept for nine hours.', { ru: 'спать', de: 'schlafen', fr: 'dormir', nl: 'slapen', ar: 'ينام' }),
    s('noun', 'the rest you take at night', 'You need more sleep.', { ru: 'сон', de: 'Schlaf', fr: 'sommeil', nl: 'slaap', ar: 'نوم' }),
  ],
  help: [
    s('verb', 'to make something easier for someone', 'Can you help me with this?', { ru: 'помогать', de: 'helfen', fr: 'aider', nl: 'helpen', ar: 'يساعد' }),
    s('noun', 'something that makes a task easier', 'Your notes were a great help.', { ru: 'помощь', de: 'Hilfe', fr: 'aide', nl: 'hulp', ar: 'مساعدة' }),
  ],
  support: [
    s('verb', 'to help someone or agree with them', 'Her family supported the decision.', { ru: 'поддерживать', de: 'unterstützen', fr: 'soutenir', nl: 'steunen', ar: 'يدعم' }),
    s('noun', 'help given to someone', 'Thank you for your support.', { ru: 'поддержка', de: 'Unterstützung', fr: 'soutien', nl: 'steun', ar: 'دعم' }),
    s('verb', 'to hold the weight of something', 'Two columns support the roof.', { ru: 'поддерживать (держать)', de: 'stützen', fr: 'soutenir (porter)', nl: 'schragen', ar: 'يسند' }),
  ],
  answer: [
    s('verb', 'to reply to a question', 'She answered every question.', { ru: 'отвечать', de: 'antworten', fr: 'répondre', nl: 'antwoorden', ar: 'يجيب' }),
    s('noun', 'a reply to a question', 'The answer is on page ten.', { ru: 'ответ', de: 'Antwort', fr: 'réponse', nl: 'antwoord', ar: 'إجابة' }),
    s('noun', 'the solution to a problem', 'There is no easy answer.', { ru: 'решение', de: 'Lösung', fr: 'solution', nl: 'oplossing', ar: 'حل' }),
  ],
  exercise: [
    s('noun', 'physical activity to stay fit', 'Walking is good exercise.', { ru: 'физическая нагрузка', de: 'Bewegung', fr: 'exercice physique', nl: 'lichaamsbeweging', ar: 'تمرين رياضي' }),
    s('noun', 'a task done to practise something', 'Do exercise three at home.', { ru: 'упражнение', de: 'Übung', fr: 'exercice', nl: 'oefening', ar: 'تمرين دراسي' }),
  ],
  practice: [
    s('noun', 'doing something again to improve', 'It takes practice to speak well.', { ru: 'практика', de: 'Übung', fr: 'entraînement', nl: 'oefening', ar: 'تدريب' }),
    s('noun', 'the business of a doctor or lawyer', 'She has a small legal practice.', { ru: 'практика (частная)', de: 'Praxis', fr: 'cabinet', nl: 'praktijk', ar: 'عيادة أو مكتب' }),
    s('noun', 'the usual way something is done', 'It is common practice here.', { ru: 'обычай, принятая практика', de: 'übliche Praxis', fr: 'usage', nl: 'gebruik', ar: 'ممارسة معتادة' }),
  ],
  service: [
    s('noun', 'work done for a customer', 'The service in that hotel is excellent.', { ru: 'обслуживание', de: 'Service', fr: 'service', nl: 'service', ar: 'خدمة' }),
    s('noun', 'a religious ceremony', 'The service starts at ten.', { ru: 'богослужение', de: 'Gottesdienst', fr: 'office', nl: 'dienst (kerk)', ar: 'قداس' }),
    s('noun', 'a system that meets a public need', 'The bus service runs all night.', { ru: 'служба, сообщение', de: 'Verkehrsdienst', fr: 'service (public)', nl: 'dienstverlening', ar: 'خدمة عامة' }),
  ],
  market: [
    s('noun', 'a place where goods are sold', 'We buy fruit at the market.', { ru: 'рынок (место)', de: 'Markt', fr: 'marché', nl: 'markt', ar: 'سوق' }),
    s('noun', 'the demand for a product', 'There is a big market for electric cars.', { ru: 'рынок (спрос)', de: 'Absatzmarkt', fr: 'marché (débouché)', nl: 'afzetmarkt', ar: 'سوق تجاري' }),
  ],
  star: [
    s('noun', 'a point of light in the night sky', 'You can see the stars from here.', { ru: 'звезда', de: 'Stern', fr: 'étoile', nl: 'ster', ar: 'نجم' }),
    s('noun', 'a very famous performer', 'She became a film star.', { ru: 'звезда (знаменитость)', de: 'Star', fr: 'vedette', nl: 'ster (beroemdheid)', ar: 'نجم مشهور' }),
  ],
  tongue: [
    s('noun', 'the soft part in your mouth you taste with', 'He burnt his tongue.', { ru: 'язык (орган)', de: 'Zunge', fr: 'langue (organe)', nl: 'tong', ar: 'لسان' }),
    s('noun', 'a language', 'German is her mother tongue.', { ru: 'язык (речь)', de: 'Sprache', fr: 'langue (parlée)', nl: 'taal', ar: 'لغة' }),
  ],
  cold: [
    s('adjective', 'at a low temperature', 'The water is too cold.', { ru: 'холодный', de: 'kalt', fr: 'froid', nl: 'koud', ar: 'بارد' }),
    s('noun', 'a common illness of the nose and throat', 'I have a bad cold.', { ru: 'простуда', de: 'Erkältung', fr: 'rhume', nl: 'verkoudheid', ar: 'زكام' }),
  ],
  card: [
    s('noun', 'a plastic card used to pay', 'Can I pay by card?', { ru: 'банковская карта', de: 'Karte (Bank)', fr: 'carte bancaire', nl: 'pinpas', ar: 'بطاقة دفع' }),
    s('noun', 'stiff paper with a message on it', 'Send her a birthday card.', { ru: 'открытка', de: 'Karte (Grußkarte)', fr: 'carte (de vœux)', nl: 'kaart', ar: 'بطاقة تهنئة' }),
  ],
  page: [
    s('noun', 'one side of a sheet in a book', 'Turn to page twelve.', { ru: 'страница', de: 'Seite', fr: 'page', nl: 'bladzijde', ar: 'صفحة' }),
    s('noun', 'a screen of a website', 'The page did not load.', { ru: 'страница (сайта)', de: 'Webseite', fr: 'page (web)', nl: 'webpagina', ar: 'صفحة ويب' }),
  ],
  table: [
    s('noun', 'furniture with a flat top and legs', 'Put the plates on the table.', { ru: 'стол', de: 'Tisch', fr: 'table', nl: 'tafel', ar: 'طاولة' }),
    s('noun', 'information arranged in rows and columns', 'The table shows last year’s sales.', { ru: 'таблица', de: 'Tabelle', fr: 'tableau', nl: 'tabel', ar: 'جدول' }),
  ],
  room: [
    s('noun', 'a space inside a building with walls', 'The flat has four rooms.', { ru: 'комната', de: 'Zimmer', fr: 'pièce', nl: 'kamer', ar: 'غرفة' }),
    s('noun', 'space for something', 'There is no room in the car.', { ru: 'место (пространство)', de: 'Platz', fr: 'place', nl: 'ruimte', ar: 'مكان متسع' }),
  ],
  water: [
    s('noun', 'the clear liquid you drink', 'Would you like some water?', { ru: 'вода', de: 'Wasser', fr: 'eau', nl: 'water', ar: 'ماء' }),
    s('verb', 'to pour water on plants', 'Water the flowers every day.', { ru: 'поливать', de: 'gießen', fr: 'arroser', nl: 'water geven', ar: 'يسقي' }),
  ],
  country: [
    s('noun', 'a nation with its own government', 'She has lived in four countries.', { ru: 'страна', de: 'Land', fr: 'pays', nl: 'land', ar: 'بلد' }),
    s('noun', 'land away from towns', 'They moved to the country.', { ru: 'сельская местность', de: 'Land (ländlich)', fr: 'campagne', nl: 'platteland', ar: 'الريف' }),
  ],
  company: [
    s('noun', 'a business that sells goods or services', 'He works for a Dutch company.', { ru: 'компания', de: 'Firma', fr: 'entreprise', nl: 'bedrijf', ar: 'شركة' }),
    s('noun', 'being with other people', 'I enjoy her company.', { ru: 'общество, компания', de: 'Gesellschaft', fr: 'compagnie', nl: 'gezelschap', ar: 'صحبة' }),
  ],
  post: [
    s('noun', 'the system that delivers letters', 'The cheque came in the post.', { ru: 'почта', de: 'Post', fr: 'courrier', nl: 'post', ar: 'بريد' }),
    s('noun', 'a job in an organisation', 'She applied for the post of manager.', { ru: 'должность', de: 'Stelle', fr: 'poste', nl: 'functie', ar: 'منصب' }),
    s('verb', 'to publish something online', 'He posted a photo of the trip.', { ru: 'публиковать', de: 'posten', fr: 'publier', nl: 'plaatsen', ar: 'ينشر' }),
  ],
  letter: [
    s('noun', 'a written message sent by post', 'I got a letter from the bank.', { ru: 'письмо', de: 'Brief', fr: 'lettre', nl: 'brief', ar: 'رسالة' }),
    s('noun', 'a written symbol of the alphabet', 'The word has seven letters.', { ru: 'буква', de: 'Buchstabe', fr: 'lettre (alphabet)', nl: 'letter', ar: 'حرف' }),
  ],
  power: [
    s('noun', 'the ability to control people or events', 'The president has real power.', { ru: 'власть', de: 'Macht', fr: 'pouvoir', nl: 'macht', ar: 'سلطة' }),
    s('noun', 'electricity', 'The power went off in the storm.', { ru: 'электричество', de: 'Strom', fr: 'électricité', nl: 'stroom', ar: 'كهرباء' }),
    s('noun', 'physical strength or force', 'The engine has enormous power.', { ru: 'мощность', de: 'Leistung', fr: 'puissance', nl: 'vermogen', ar: 'قدرة' }),
  ],
  wave: [
    s('noun', 'a raised line of water on the sea', 'The waves were very high.', { ru: 'волна', de: 'Welle', fr: 'vague', nl: 'golf', ar: 'موجة' }),
    s('verb', 'to move your hand to say hello', 'She waved from the window.', { ru: 'махать', de: 'winken', fr: 'faire signe', nl: 'zwaaien', ar: 'يلوّح' }),
  ],
  date: [
    s('noun', 'a particular day of the year', 'What is the date today?', { ru: 'дата', de: 'Datum', fr: 'date', nl: 'datum', ar: 'تاريخ' }),
    s('noun', 'a romantic meeting', 'They went on their first date.', { ru: 'свидание', de: 'Verabredung', fr: 'rendez-vous amoureux', nl: 'afspraakje', ar: 'موعد غرامي' }),
  ],
  glass: [
    s('noun', 'the hard clear material in windows', 'The door is made of glass.', { ru: 'стекло', de: 'Glas (Material)', fr: 'verre (matière)', nl: 'glas', ar: 'زجاج' }),
    s('noun', 'a container you drink from', 'A glass of water, please.', { ru: 'стакан', de: 'Glas (Trinkglas)', fr: 'verre (à boire)', nl: 'glas (drinkglas)', ar: 'كوب' }),
  ],
  bar: [
    s('noun', 'a place that serves drinks', 'We met in a bar near the station.', { ru: 'бар', de: 'Bar', fr: 'bar', nl: 'bar', ar: 'حانة' }),
    s('noun', 'a long piece of solid material', 'A bar of chocolate.', { ru: 'плитка, брусок', de: 'Riegel', fr: 'barre', nl: 'reep', ar: 'لوح' }),
  ],
  coach: [
    s('noun', 'a person who trains a team', 'The coach chose the team.', { ru: 'тренер', de: 'Trainer', fr: 'entraîneur', nl: 'coach', ar: 'مدرب' }),
    s('noun', 'a long-distance bus', 'We took the coach to Manchester.', { ru: 'автобус (междугородный)', de: 'Reisebus', fr: 'autocar', nl: 'touringcar', ar: 'حافلة سفر' }),
  ],
  ball: [
    s('noun', 'a round object used in games', 'He kicked the ball.', { ru: 'мяч', de: 'Ball', fr: 'ballon', nl: 'bal', ar: 'كرة' }),
    s('noun', 'a formal party with dancing', 'They met at a ball.', { ru: 'бал', de: 'Ball (Tanzfest)', fr: 'bal', nl: 'bal (feest)', ar: 'حفل راقص' }),
  ],
  trip: [
    s('noun', 'a short journey to a place', 'We took a day trip to the coast.', { ru: 'поездка', de: 'Ausflug', fr: 'excursion', nl: 'uitstapje', ar: 'رحلة' }),
    s('verb', 'to catch your foot and almost fall', 'He tripped on the step.', { ru: 'споткнуться', de: 'stolpern', fr: 'trébucher', nl: 'struikelen', ar: 'يتعثر' }),
  ],
  stress: [
    s('noun', 'worry caused by pressure', 'The job causes a lot of stress.', { ru: 'стресс', de: 'Stress', fr: 'stress', nl: 'stress', ar: 'توتر' }),
    s('noun', 'the strongest part of a spoken word', 'The stress is on the second syllable.', { ru: 'ударение', de: 'Betonung', fr: 'accent tonique', nl: 'klemtoon', ar: 'نبر' }),
  ],
  plan: [
    s('noun', 'what you intend to do', 'What are your plans for Friday?', { ru: 'план', de: 'Plan', fr: 'plan', nl: 'plan', ar: 'خطة' }),
    s('noun', 'a drawing of a building from above', 'The architect showed us the plans.', { ru: 'чертёж', de: 'Grundriss', fr: 'plan (dessin)', nl: 'plattegrond', ar: 'مخطط' }),
  ],
  court: [
    s('noun', 'where legal cases are decided', 'The case went to court.', { ru: 'суд', de: 'Gericht', fr: 'tribunal', nl: 'rechtbank', ar: 'محكمة' }),
    s('noun', 'the marked area for a sport', 'They booked a tennis court.', { ru: 'корт', de: 'Platz (Sport)', fr: 'court', nl: 'baan (sport)', ar: 'ملعب رياضي' }),
  ],
  park: [
    s('noun', 'a public area with grass and trees', 'The children play in the park.', { ru: 'парк', de: 'Park', fr: 'parc', nl: 'park', ar: 'حديقة عامة' }),
    s('verb', 'to leave a car somewhere', 'You cannot park here.', { ru: 'парковать', de: 'parken', fr: 'se garer', nl: 'parkeren', ar: 'يركن' }),
  ],
  film: [
    s('noun', 'a story told in moving pictures', 'We watched a French film.', { ru: 'фильм', de: 'Film', fr: 'film', nl: 'film', ar: 'فيلم' }),
    s('verb', 'to record something with a camera', 'They filmed the whole concert.', { ru: 'снимать', de: 'filmen', fr: 'filmer', nl: 'filmen', ar: 'يصوّر' }),
  ],
};
