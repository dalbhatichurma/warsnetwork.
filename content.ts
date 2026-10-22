// Edit this file to change the FAQ and Updates pages.
export const FAQ: [string, string][] = [
  ['How do I join WarNetwork?', 'Open Minecraft Java Edition, choose Multiplayer, Add Server, paste play.warnetwork.fun and join.'],
  ['What game modes are there?', 'Lifesteal, where every fight changes the balance of hearts, and a Practice arena to sharpen your combat.'],
  ['How do I buy a rank or coins?', 'Add items to your cart, check out, pay the exact total by UPI and upload your payment screenshot. Staff verify the payment and grant the item in game.'],
  ['Can I get a refund?', 'Rank purchases are seasonal and non-refundable.'],
  ['How long until my purchase arrives?', 'After staff match your amount and UTR reference, the item is granted directly to your Minecraft username. Track it from the Link Account page.'],
  ['How do I link my account?', 'Use LINK ACCOUNT in the top bar to connect Discord and your Minecraft profile.'],
  ['Does WarNetwork support Bedrock?', 'Ask in our Discord. Edition and version details are confirmed there.'],
  ['I found a bug or a cheater', 'Report it to staff on Discord with as much detail as you can.'],
];
// Newest first. Add a new line at the top for each update.
export const UPDATES: { date: string; title: string; lines: string[] }[] = [
  { date: '2026-10-06', title: 'New look', lines: ['Minecraft-style hotbar navigation', 'Advancement-style rules', 'Rank tooltips and enchantment glint', 'Player skin heads on leaderboards and staff', 'Rank comparison table, FAQ and Updates pages'] },
  { date: '2026-10-05', title: 'Account linking', lines: ['Link Discord and Minecraft to get a player profile'] },
];

// Terms of the website and server. Edit freely; shown on the Info page, Terms tab.
export const TERMS_UPDATED = 'October 2026';
export const TERMS: { title: string; lines: string[] }[] = [
  { title: 'About these terms', lines: [
    'By using the WarNetwork website or joining play.warnetwork.fun you agree to these terms and to our Rules.',
    'WarNetwork is an independent community. It is not affiliated with, endorsed by or associated with Mojang Studios or Microsoft. Minecraft is a trademark of Mojang Studios.'] },
  { title: 'Using the website', lines: [
    'Use the website for personal, lawful purposes only.',
    'Do not attack, overload, scrape heavily or try to break into the website, the staff area or other players\' accounts.',
    'Do not pretend to be staff, and do not misuse support tickets or the Discord server.'] },
  { title: 'Server conduct', lines: [
    'You must follow the Rules at all times. Staff decide whether a rule has been broken.',
    'Cheating, exploiting bugs, duping, harassment and ban evasion can lead to a mute, ban or removal of items and progress, with or without warning.',
    'If you think a punishment was a mistake, open a ticket on our Discord to appeal.'] },
  { title: 'Your accounts', lines: [
    'You are responsible for your Minecraft and Discord accounts and for everything done with them.',
    'Never share passwords. Staff will never ask for your password.',
    'Linking an account is optional and you may ask staff to unlink it.'] },
  { title: 'Store, ranks and purchases', lines: [
    'Ranks, coins and perks are bought by opening a Store Support ticket on our Discord. Staff will tell you how to pay and will grant your purchase in game.',
    'Purchases are digital items for use on WarNetwork only. They have no real-world value and cannot be exchanged for money.',
    'Purchases are final and non-refundable once delivered, except where the law requires otherwise.',
    'Opening a payment dispute or chargeback instead of speaking to staff may lead to the loss of the purchase and a ban.',
    'Ranks, perks and prices may change between seasons.'] },
  { title: 'Virtual items and progress', lines: [
    'Items, coins, hearts, ranks and stats exist only inside the game and are not your property.',
    'Staff may remove items or progress gained through bugs, exploits or rule breaking.'] },
  { title: 'Availability', lines: [
    'The website and server are provided as they are, without any guarantee of uptime or a particular feature.',
    'We may restart, update, roll back or wipe parts of the server, and may close or change a game mode at any time.'] },
  { title: 'Privacy', lines: [
    'We only receive what you give us: your Minecraft and Discord names when you link an account, and what you tell staff in tickets.',
    'The website keeps some preferences in your browser, such as your last viewed status.',
    'The site uses outside services that can see your IP address when your browser loads them: Discord, player head images from mc-heads.net, public server status checkers, and Google Fonts.',
    'To ask us to remove information we hold about you, open a ticket on our Discord.'] },
  { title: 'Changes and contact', lines: [
    'We may update these terms. Using the website or server after a change means you accept it.',
    'Questions about these terms: open a ticket on our Discord.'] },
];
