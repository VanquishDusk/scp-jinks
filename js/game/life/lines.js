// What people say. Pools are keyed by "voice" (see traits.js voiceOf), so the
// same question gets a different answer from a kind nurse, a bored guard or a
// shady janitor. Placeholders: {me} player designation, {name} speaker,
// {other} someone else, {scp} an SCP on site, {dead} a recently lost colleague,
// {place} a location, {food} today's lunch.

export const FOODS = ['meatloaf', 'mystery stew', 'fish sticks', 'grey lasagna', 'chili', 'pasta bake', 'tofu surprise', 'shepherd\'s pie'];

// ---- Passing greetings (speech bubbles) -------------------------------------
export const GREET = {
  warm: ['Morning!', 'Hey, how are you holding up?', 'Good to see you.', 'Take care of yourself today.', 'Hi there.'],
  cold: ['...', 'Out of my way.', 'Hm.', 'Watch where you\'re going.'],
  lazy: ['*yawn* Morning.', 'Is it lunch yet?', 'Hey.', 'Ugh. Mondays.'],
  driven: ['Busy, busy.', 'Morning. Can\'t stop.', 'Excuse me — deadline.'],
  anxious: ['Oh! You scared me.', 'H-hi.', 'Did you hear that? No? Okay.'],
  bold: ['Quiet day.', 'Morning.', 'All good?'],
  chatty: ['Hey you! Got a sec later?', 'Morning! Did you hear about—never mind, later!', 'There you are!'],
  loner: ['...', 'Mm.'],
  shady: ['Hey, friend.', 'Psst. ...Never mind.', 'Keep it moving.'],
  straight: ['Morning.', 'Afternoon.'],
  curious: ['Oh — have you been to the Keter wing?', 'Hi! Anything strange today?'],
  dull: ['Hey.', 'Morning.'],
  plain: ['Hey.', 'Morning.', 'Hi.'],
};
// Staff to a Class-D player.
export const GREET_D = {
  warm: ['Hang in there.', 'Hey. You doing okay?', 'Hi. Stay safe today.'],
  cold: ['Back off, D-class.', 'Don\'t touch anything.', 'Keep your distance.'],
  shady: ['Psst. Need something?', 'Hey, orange. Business is open.'],
  anxious: ['P-please keep your distance.'],
  plain: ['...', 'Move along.'],
};
// Class-D NPCs to the player.
export const GREET_FROM_D = {
  // to a fellow Class-D
  classd: ['Hey, {me}.', 'Still breathing?', 'Keep your head down today.', 'They pulled someone for testing at dawn.', 'Psst. Over here later.'],
  // to a guard
  security: ['Officer.', '...', 'Didn\'t do anything, boss.', 'Nice day for it, huh?'],
};

// ---- "How's it going?" ---------------------------------------------------------
export const SMALLTALK = {
  warm: ['Honestly? Better now. People forget to ask that down here.', 'Tired, but okay. You? Don\'t let them grind you down.', 'It\'s a strange place to work, but the people make it bearable.'],
  cold: ['None of your business.', 'It was going fine.', 'Do you need something or not?'],
  lazy: ['Slow. Slow is good. Slow means nothing is on fire.', 'I\'m saving my energy for lunch.', 'Counting the minutes. Want to count with me?'],
  driven: ['Three reports, one test, and nobody has refilled the printer. So, great.', 'Busy. Good busy. Mostly.', 'Can\'t talk long. The numbers won\'t crunch themselves.'],
  anxious: ['Fine! Fine. I just... keep hearing things in the vents.', 'Is it normal for the lights to flicker like that? It\'s normal, right?', 'I check the exits every morning. Habit.'],
  bold: ['Quiet. Too quiet, if you ask me.', 'I\'ve seen worse days. I\'ve seen much worse days.', 'Bring on the alarms. Beats paperwork.'],
  chatty: ['Oh, where do I start! So the cafeteria is doing {food} again, and Records lost an entire filing cabinet, and—', 'Busy morning! Everyone\'s acting weird. Want the gossip?', 'Good! Great, actually. Did you hear what happened in Lab A yesterday?'],
  loner: ['Fine.', 'Mm. Busy.', 'I\'d rather not chat, if that\'s alright.'],
  shady: ['Business is business. You know how it is.', 'Can\'t complain. Well — I can, but it costs extra.', 'Depends who\'s asking.'],
  straight: ['By the book, as always.', 'Fine, thank you. Everything in order.', 'Busy, but nothing I can\'t handle properly.'],
  curious: ['Wonderful — I think I finally have a theory about {scp}.', 'Do you ever wonder what the anomalies think about us?', 'I\'ve been reading old incident logs. Fascinating stuff.'],
  dull: ['Same as always.', 'It\'s going.'],
  plain: ['Can\'t complain.', 'Getting by.', 'Another day.'],
};
// Class-D NPCs answering another Class-D.
export const SMALLTALK_D = {
  warm: ['Still alive. That\'s a good day in here.', 'Keep your chin up. We\'ll get through this.'],
  cold: ['Get lost.', 'What do you want?'],
  anxious: ['They took Rourke yesterday. Never came back. Am I next?', 'I can\'t sleep. Every time the door buzzes I think it\'s my turn.'],
  bold: ['One of these days, I\'m walking out of here.', 'They can test me all they want. I\'m not breaking.'],
  chatty: ['You hear the new guy cries every night? Poor kid.', 'Guards changed the patrol again. Watch the corridor around lunch.'],
  shady: ['Got smokes? No? Then we\'ve got nothing to talk about.', 'I can get things. For a price.'],
  plain: ['Same old.', 'Just waiting.'],
};

// ---- Gossip ("Heard anything interesting?") ------------------------------------
export const NO_GOSSIP = {
  loner: ['I keep to myself.', 'I don\'t do gossip.'],
  straight: ['I\'m not one to talk about colleagues.', 'Rumours get people killed here.'],
  cold: ['Even if I had, why would I tell you?'],
  plain: ['Nothing worth repeating.', 'Not really.'],
};
/** Back to the top of a conversation. */
export const AGAIN = {
  warm: ['What else can I do for you?', 'Anything else on your mind?'],
  cold: ['What now?', 'Is there more?', 'Make it quick.'],
  lazy: ['Mm? Something else?', 'Yeah?'],
  driven: ['Anything else? I\'m busy.', 'Quickly, please.'],
  anxious: ['Y-yes?', 'Is something wrong?'],
  bold: ['Go on.', 'What else?'],
  chatty: ['Oh! What else?', 'Yes? Yes? What?'],
  loner: ['...Yes?', 'Hm?'],
  shady: ['What else you need?', 'Go on. I\'m listening.'],
  straight: ['Anything else?', 'Is there something else?'],
  curious: ['Yes? What is it?', 'Something else?'],
  dull: ['Yeah?', 'Mm.'],
  plain: ['Anything else?', 'Yeah?'],
};

export const GOSSIP_LEAD = ['Between you and me...', 'You didn\'t hear this from me, but...', 'Okay, so...', 'Word is...', 'Keep this quiet:'];

// ---- Plot offers by hook ---------------------------------------------------------
export const HOOK_LINES = {
  lostitem: ['I lost my {item} somewhere around {place}. I\'d look myself, but...', 'Have you seen my {item}? I put it down near {place} and it\'s gone.'],
  sweetheart: ['Could you... give this note to {other}? Don\'t read it. Please.', 'I need a favor. A small one. A note for {other}.'],
  tired: ['I haven\'t slept in two days. Cover my post for a bit? I\'ll make it worth your while.', 'Look — watch my post for a minute. I just need to close my eyes.'],
  smuggler: ['You want to make some real money? I need a package taken into D-Block. No questions.', 'There\'s a little side business here. Interested in a cut?'],
  bribable: ['Everybody has a price. Even me. Especially me.'],
  curious: ['I\'ve read every file on {scp}. I need to see it. Walk me there?', 'Officer — would you escort me to {scp}\'s chamber? Purely academic.'],
  escapee: ['I\'m getting out of here. With or without you. ...With you would be better.', 'Listen. I\'ve got a plan. I need someone with nerve.'],
  snitch: ['I\'m getting out. Got a plan. You in?', 'Keep it down. I know a way out. Interested?'],
  whistle: ['Someone\'s selling contraband to D-Block. One of your own, officer. Look into it.', 'I\'ve seen things I shouldn\'t have. A guard. Packages. D-Block.'],
  fence: ['Funny what people leave lying around. Keycards, for instance. I could part with one.', 'I find things when I clean. Interested in a keycard? Not free.'],
  feeder: ['You look starved. Here — don\'t tell the line.', 'Take this. Nobody should go hungry in a place like this.'],
};
export const ITEMS_LOST = ['reading glasses', 'lucky pen', 'family photo', 'notebook', 'lanyard', 'lunchbox', 'pocket watch', 'tin of tobacco'];

// ---- Conversations between NPCs ------------------------------------------------------
export const TOPICS = {
  work: [
    'I\'ve been staring at the same spreadsheet since dawn.', 'Did anyone fix the printer on two yet?', 'They want the {scp} report by end of shift. Can you believe it?',
    'My supervisor moved my desk again. Third time this month.', 'Do you know who has the key to the supply closet?',
  ],
  food: ['It\'s {food} again.', 'I\'m skipping lunch. Last time it moved.', 'The vending machine ate my coins again.', 'Who keeps stealing the good coffee?'],
  scp: [
    'Have you seen {scp}? Up close?', '{scp} gives me the creeps.', 'They say {scp} is getting restless.', 'I swear the cameras on {scp} glitched this morning.',
    'Somebody told me {scp} used to be a person. I don\'t believe it.',
  ],
  event: ['Were you here during the {event}?', 'After the {event} this morning I\'m not going anywhere near the HCZ.', 'Nobody tells us anything about the {event}.'],
  dead: ['I keep thinking about {dead}.', 'They cleared out {dead}\'s locker this morning.', 'It\'s not the same without {dead}.', 'Did you know {dead} well?'],
  newhire: ['There\'s a new {title} today. {other}, I think.', 'Have you met the new one? {other}. Seems nervous.'],
  boss: ['The Director came down to the cafeteria today. Nobody breathed.', 'Mercer wrote me up for a crooked tie. A tie!', 'Management wants "efficiency". Whatever that means.'],
  personal: ['My sister thinks I work in insurance.', 'I haven\'t seen the sun in eight days.', 'I started a garden. In my quarters. Under a lamp.', 'Thinking of asking for a transfer. Somewhere boring.', 'I had the dream again.'],
  dclass: ['Testing had three subjects this morning. Two came back.', 'D-block was loud last night.', 'I try not to learn their names.'],
};
export const REPLIES = {
  warm: ['Oh no. Are you alright?', 'Hang in there.', 'I know, right? Come find me at lunch.', 'That\'s awful. I\'m sorry.'],
  cold: ['And?', 'Not my problem.', 'Spare me.', 'Did I ask?'],
  lazy: ['Mm-hm.', 'Wake me when it matters.', 'Sounds like work.', 'Yeah... yeah.'],
  driven: ['No time to dwell. Back to it.', 'Write it up and move on.', 'Then fix it.'],
  anxious: ['Don\'t say that. Please.', 'Oh god. Oh god.', 'I knew something was wrong.', 'Should we tell someone?'],
  bold: ['Ha. Bring it on.', 'Seen worse.', 'Relax. It\'s fine.'],
  chatty: ['No WAY. Tell me everything.', 'Oh, that reminds me of the time—', 'Wait, wait, start from the beginning!'],
  loner: ['Hm.', '...', 'Okay.'],
  shady: ['Interesting. Very interesting.', 'Keep that between us.', 'Everything\'s negotiable.'],
  straight: ['That should be reported.', 'Follow the procedure.', 'I\'ll mention it to the supervisor.'],
  curious: ['Wait, really? How?', 'Fascinating. Did anyone take notes?', 'I have so many questions.'],
  dull: ['Huh.', 'Okay.'],
  plain: ['Yeah.', 'Huh.', 'Tell me about it.', 'Right.'],
};
export const ARGUE = [
  ['You took my spot again.', 'There are no "spots". Grow up.'],
  ['You left me alone at the checkpoint for twenty minutes.', 'I was on break. Breaks are allowed.'],
  ['Stop leaving your files on my desk.', 'Then stop using my desk.'],
  ['You reported me to Mercer, didn\'t you?', 'You were asleep on duty!'],
  ['Don\'t talk to me like that.', 'I\'ll talk to you however I want.'],
];
export const ARGUE_D = [
  ['You took my bunk again.', 'Didn\'t see your name on it.'],
  ['You owe me two cigarettes.', 'I owe you nothing.'],
  ['You were talking to the guards. I saw you.', 'Mind your own business.'],
  ['Stop eating off my tray.', 'Then eat faster.'],
  ['Keep your voice down at night.', 'Make me.'],
];

// ---- Mood bubbles -----------------------------------------------------------------------
export const WORKING = {
  research: ['Hm. That\'s not right.', 'Where did I save that...', 'Fascinating.', 'Note to self: never again.', '*typing*'],
  records: ['Who filed this under "miscellaneous"?', 'Alphabetical. ALPHABETICAL.', '*shuffles papers*'],
  medical: ['Next patient.', 'Hold still.', 'Pulse is fine.'],
  office: ['*stamp*', 'Form 7-C. Of course.', 'Who approved this?'],
  janitor: ['*whistles*', 'Who tracks this in here?', 'Always the same corridor.'],
  tech: ['Who wired this?', 'Hand me the... never mind.', 'Rebooting. Again.'],
  cook: ['Order up!', 'Who wants seconds? Nobody? Fine.', 'Stir... stir...'],
  post: ['*yawns*', 'All quiet.', 'Ten more hours.'],
  classd: ['...', 'Two-hundred and one, two-hundred and two...', '*hums*'],
};
export const NAP = ['Zzz...', 'Zzz... five more minutes...', 'Zzz'];
export const SCARED = ['What was that?!', 'Run!', 'Oh god, oh god!', 'Get down!', 'Help!'];
export const SHELTER = ['I\'m not moving until it\'s over.', 'Lock the door. LOCK IT.', 'Is it gone?', 'Please, please, please...'];
export const WITNESS_DEATH = ['No! NO!', 'Oh my god...', 'Medic! We need a medic!', 'Don\'t look. Don\'t look.'];
export const CHIEF_SCOLD = ['{other}! On your feet. Back to your post.', 'Sleeping on duty, {other}? That\'s going in my report.', '{other}. Post. Now.'];
export const SCOLDED = ['Yes, Chief. Sorry, Chief.', 'I was just resting my eyes...', 'On my way.'];
export const SHOVE = ['Move it, D.', 'Did I say you could stand there?', 'Eyes down, orange.'];
export const SHOVED = {
  bold: ['Touch me again and see what happens.', '...Yeah, real brave.'],
  anxious: ['S-sorry, sorry!', 'I\'m going, I\'m going!'],
  plain: ['...', 'Fine.'],
};
export const KINDNESS = ['Here. Don\'t tell anyone.', 'Eat something. You look awful.', 'Hey. It\'ll be okay.'];
export const THANKS = ['...Thanks.', 'Thank you. Really.', 'I won\'t forget this.'];
export const REPORT_D = ['Security! There\'s a D-class wandering around {place}!', 'Uh, security? Loose D-class near {place}.'];
export const LOOK_AWAY = ['I didn\'t see anything.', 'Go. Quickly. I didn\'t see you.'];
