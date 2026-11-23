/* ═══════════════════════════════════════════════════════════════════════
   SHADDAI TACTICS v2 — FFTA-accurate data layer
   • 34 jobs across 5 races with unlock requirements
   • 100+ equipment pieces with proper AP costs
   • Damage formulas: WAtk - WDef/2 × Power/100
   • 11 status ailments with full effect rules
   • 24 story missions + dispatch + encounters + shop
   • Laws system with Judge enforcement
   ═══════════════════════════════════════════════════════════════════════ */
(function(){'use strict';

// ── RACES ─────────────────────────────────────────────────────────────
const RACES = {
  Human:  { name:'Hume',  sprite:'#e8c45c', totema:'Mateus', desc:'Balanced across all jobs.' },
  Moogle: { name:'Moogle',sprite:'#ff9ee8', totema:'Famfrit',desc:'Small + magical, weak physical.' },
  Viera:  { name:'Viera', sprite:'#5fe0ff', totema:'Exodus', desc:'Agile + ranged.' },
  NuMou:  { name:'Nu Mou',sprite:'#c9a6ff', totema:'Ultima', desc:'Tall + magical, weak agility.' },
  Bangaa: { name:'Bangaa',sprite:'#ff7a3c', totema:'Adrammelech', desc:'Reptilian + physical, slow.' }
};

// ── 34 JOBS with unlock requirements ─────────────────────────────────
// FFTA uses: "master X A-abilities from specific jobs" to unlock
// Each job: base stats, allowed races, unlock description
const JOBS = {
  Soldier:    { hp:16,mp:0, watk:5,wdef:5,mpow:1,mres:4,spd:5, move:4,jump:2, evade:50,sres:50, races:['Human'],              unlock:'Auto', desc:'Front-line infantry' },
  Paladin:    { hp:24,mp:6, watk:7,wdef:8,mpow:4,mres:6,spd:4, move:4,jump:2, evade:45,sres:55, races:['Human'],              unlock:'2 Soldier A-abilities', desc:'Armored knight + white magic' },
  Fighter:    { hp:20,mp:0, watk:8,wdef:6,mpow:2,mres:3,spd:6, move:4,jump:3, evade:55,sres:45, races:['Human'],              unlock:'2 Soldier A-abilities', desc:'Martial arts specialist' },
  Thief:      { hp:14,mp:0, watk:5,wdef:3,mpow:1,mres:2,spd:8, move:5,jump:3, evade:60,sres:50, races:['Human','Moogle'],    unlock:'Auto', desc:'Steals items/gil/equipment' },
  Ninja:      { hp:16,mp:4, watk:7,wdef:4,mpow:3,mres:3,spd:10,move:5,jump:4, evade:65,sres:45, races:['Human'],              unlock:'2 Thief A-abilities', desc:'Throw + dual-wield' },
  Archer:     { hp:14,mp:0, watk:6,wdef:3,mpow:1,mres:2,spd:6, move:4,jump:2, evade:50,sres:50, races:['Human','Viera'],     unlock:'Auto', desc:'Ranged bow attacks' },
  Hunter:     { hp:16,mp:0, watk:6,wdef:4,mpow:2,mres:3,spd:7, move:4,jump:3, evade:55,sres:45, races:['Human'],              unlock:'2 Archer A-abilities', desc:'Bow + capture monsters' },
  WhiteMage:  { hp:12,mp:10,wdef:2,mres:7,mpow:7,spd:5, watk:3, move:4,jump:2, evade:45,sres:55, races:['Human','NuMou','Viera'], unlock:'Auto', desc:'Healing + defensive magic' },
  BlackMage:  { hp:12,mp:10,wdef:2,mres:5,mpow:8,spd:5, watk:3, move:4,jump:2, evade:40,sres:60, races:['Human','NuMou','Moogle'],unlock:'Auto', desc:'Offensive elemental magic' },
  Illusionist:{ hp:14,mp:8, watk:3,wdef:3,mpow:7,mres:6,spd:6, move:4,jump:2, evade:45,sres:55, races:['Human','NuMou'],      unlock:'3 WM + 5 BM A-abilities', desc:'All-target magic' },
  BlueMage:   { hp:16,mp:6, watk:5,wdef:4,mpow:6,mres:5,spd:6, move:4,jump:2, evade:50,sres:60, races:['Human'],              unlock:'1 WM + 1 BM A-ability', desc:'Learn monster skills' },
  Warrior:    { hp:22,mp:0, watk:9,wdef:6,mpow:1,mres:3,spd:5, move:4,jump:2, evade:45,sres:50, races:['Bangaa'],             unlock:'Auto', desc:'Heavy melee + breaks' },
  Dragoon:    { hp:22,mp:2, watk:8,wdef:7,mpow:2,mres:4,spd:6, move:4,jump:8, evade:45,sres:50, races:['Bangaa'],             unlock:'2 Warrior A-abilities', desc:'Jump + dragon skills' },
  Defender:   { hp:30,mp:0, watk:6,wdef:10,mpow:1,mres:4,spd:3, move:3,jump:2, evade:40,sres:55, races:['Bangaa'],            unlock:'2 Warrior A-abilities', desc:'Cover + taunt' },
  Gladiator:  { hp:24,mp:4, watk:9,wdef:7,mpow:3,mres:4,spd:5, move:4,jump:3, evade:50,sres:45, races:['Bangaa'],             unlock:'2 Warrior A-abilities', desc:'Spellblade + martial' },
  WhiteMonk:  { hp:20,mp:4, watk:7,wdef:6,mpow:4,mres:5,spd:7, move:4,jump:3, evade:55,sres:50, races:['Bangaa'],             unlock:'Auto', desc:'Chi attacks + healing' },
  Bishop:     { hp:18,mp:8, watk:5,wdef:5,mpow:7,mres:7,spd:5, move:4,jump:2, evade:40,sres:55, races:['Bangaa'],             unlock:'2 White Monk A-abilities', desc:'Holy magic + prayer' },
  Templar:    { hp:24,mp:4, watk:7,wdef:8,mpow:3,mres:6,spd:4, move:4,jump:2, evade:45,sres:55, races:['Bangaa'],             unlock:'2 White Monk A-abilities', desc:'Sacred blade + buffs' },
  TimeMage:   { hp:14,mp:8, watk:3,wdef:3,mpow:7,mres:6,spd:6, move:4,jump:2, evade:45,sres:55, races:['NuMou','Moogle'],    unlock:'5 BM A-abilities', desc:'Haste/Slow/Stop' },
  Alchemist:  { hp:16,mp:6, watk:4,wdef:4,mpow:6,mres:5,spd:5, move:4,jump:2, evade:45,sres:55, races:['NuMou'],              unlock:'2 WM + 5 BM A-abilities', desc:'Philters + status' },
  Beastmaster:{ hp:16,mp:4, watk:6,wdef:5,mpow:4,mres:4,spd:6, move:4,jump:2, evade:50,sres:50, races:['NuMou'],              unlock:'Auto', desc:'Control monsters' },
  Morpher:    { hp:18,mp:6, watk:5,wdef:5,mpow:5,mres:5,spd:6, move:4,jump:2, evade:50,sres:50, races:['NuMou'],              unlock:'5 Beastmaster A-abilities', desc:'Shapeshift' },
  Sage:       { hp:18,mp:12,wdef:4,mres:7,mpow:9,spd:5, watk:5, move:4,jump:2, evade:45,sres:55, races:['NuMou'],             unlock:'3 WM + 2 Beastmaster A-abilities', desc:'All-school magic' },
  Fencer:     { hp:16,mp:0, watk:7,wdef:5,mpow:2,mres:4,spd:8, move:5,jump:3, evade:60,sres:45, races:['Viera'],              unlock:'Auto', desc:'Rapier combos' },
  Elementalist:{hp:16,mp:10,wdef:3,mres:6,mpow:8,spd:5, watk:3, move:4,jump:2, evade:45,sres:55, races:['Viera'],              unlock:'1 WM + 1 Fencer A-ability', desc:'Spirit magic' },
  RedMage:    { hp:16,mp:6, watk:5,wdef:4,mpow:6,mres:5,spd:6, move:4,jump:2, evade:50,sres:50, races:['Viera'],              unlock:'1 Fencer A-ability', desc:'Blend of black + white' },
  Summoner:   { hp:14,mp:14,wdef:3,mres:7,mpow:9,spd:5, watk:3, move:4,jump:2, evade:40,sres:60, races:['Viera'],             unlock:'2 WM + 2 Elementalist A-abilities', desc:'Summon espers' },
  Assassin:   { hp:16,mp:2, watk:8,wdef:4,mpow:2,mres:3,spd:9, move:5,jump:3, evade:65,sres:45, races:['Viera'],              unlock:'2 Elementalist + 1 Sniper A-ability', desc:'Quick KO' },
  Sniper:     { hp:18,mp:0, watk:8,wdef:4,mpow:2,mres:3,spd:7, move:4,jump:2, evade:55,sres:45, races:['Viera'],              unlock:'2 Archer A-abilities', desc:'Long-range bow' },
  Animist:    { hp:14,mp:8, watk:4,wdef:3,mpow:6,mres:5,spd:6, move:4,jump:2, evade:45,sres:55, races:['Moogle'],             unlock:'Auto', desc:'Summon animals' },
  MogKnight:  { hp:16,mp:4, watk:6,wdef:5,mpow:3,mres:4,spd:6, move:4,jump:3, evade:50,sres:50, races:['Moogle'],             unlock:'1 Animist A-ability', desc:'Mounted knight' },
  Gunner:     { hp:14,mp:0, watk:7,wdef:4,mpow:2,mres:3,spd:6, move:4,jump:2, evade:50,sres:50, races:['Moogle'],             unlock:'1 Animist A-ability', desc:'Firearm + status ammo' },
  Juggler:    { hp:14,mp:2, watk:5,wdef:3,mpow:4,mres:3,spd:7, move:5,jump:3, evade:60,sres:45, races:['Moogle'],             unlock:'2 Thief A-abilities', desc:'Throw + stunt' },
  Gadgeteer:  { hp:16,mp:4, watk:6,wdef:4,mpow:4,mres:4,spd:6, move:4,jump:2, evade:50,sres:50, races:['Moogle'],             unlock:'2 Thief A-abilities', desc:'Gadgets + area effects' }
};

// ── FULL EQUIPMENT LIST (weapons + armor with AP costs) ──────────────
// Based on FFTA's actual equipment-to-ability mappings
const EQUIP = [
  // WEAPONS
  { slot:'w', name:'Shortsword',     atk:3,  range:1, ability:'First Aid',   ap:100, jobs:['Soldier','Warrior'],             price:200 },
  { slot:'w', name:'Broadsword',     atk:4,  range:1, ability:'Provoke',     ap:300, jobs:['Soldier','Warrior'],             price:350 },
  { slot:'w', name:'Longsword',      atk:5,  range:1, ability:'Powerbreak',  ap:200, jobs:['Soldier','Warrior'],             price:500 },
  { slot:'w', name:'Mythril Sword',  atk:6,  range:1, ability:'Combat Combo',ap:100, jobs:['Soldier','Warrior'],             price:800 },
  { slot:'w', name:'Barong',         atk:6,  range:1, ability:'Mindbreak',   ap:200, jobs:['Soldier','Paladin'],             price:900 },
  { slot:'w', name:'Silver Sword',   atk:7,  range:1, ability:'Speedbreak',  ap:200, jobs:['Soldier','Warrior'],             price:1100 },
  { slot:'w', name:'Buster Sword',   atk:8,  range:1, ability:'Magicbreak',  ap:200, jobs:['Soldier','Warrior','Dragoon'],   price:1400 },
  { slot:'w', name:'Blood Sword',    atk:9,  range:1, ability:'Mug',         ap:300, jobs:['Soldier'],                       price:2000 },
  { slot:'w', name:'Flametongue',    atk:7,  range:1, ability:'Fire Sword',  ap:200, jobs:['Gladiator','Fighter','MogKnight'],price:1300, elem:'fire' },
  { slot:'w', name:'Ice Brand',      atk:7,  range:1, ability:'Ice Sword',   ap:200, jobs:['Gladiator','MogKnight'],         price:1300, elem:'ice' },
  { slot:'w', name:'Air Blade',      atk:8,  range:1, ability:'Bolt Sword',  ap:200, jobs:['Gladiator','Fighter'],           price:1500, elem:'thunder' },
  { slot:'w', name:'Defender',       atk:5,  range:1, ability:'Nurse',       ap:100, jobs:['Paladin','Defender'],            price:1200 },
  { slot:'w', name:'SaveTheQueen',   atk:7,  range:1, ability:'Cover',       ap:200, jobs:['Paladin','Defender','Templar'],  price:2200 },
  { slot:'w', name:'Excalibur',      atk:12, range:1, ability:'Holy Blade',  ap:300, jobs:['Paladin'],                       price:5000, elem:'holy' },
  { slot:'w', name:'Ragnarok',       atk:10, range:1, ability:'Drop Weapon', ap:200, jobs:['Paladin','Defender','Templar'],  price:4000 },
  { slot:'w', name:'Diamond Sword',  atk:9,  range:1, ability:'Sensor',      ap:300, jobs:['Soldier'],                       price:2500 },
  { slot:'w', name:'Venus Blade',    atk:8,  range:1, ability:'Doublehand',  ap:300, jobs:['Fighter','Gladiator'],           price:1800 },
  { slot:'w', name:'Atmos Blade',    atk:7,  range:1, ability:'Air Render',  ap:200, jobs:['Fighter','MogKnight'],           price:1600 },
  { slot:'w', name:'Shadow Blade',   atk:9,  range:1, ability:'Beatdown',    ap:200, jobs:['Fighter','Gladiator','MogKnight'],price:1900 },
  { slot:'w', name:'Materia Blade',  atk:14, range:1, ability:'Ultima Sword',ap:999, jobs:['Gladiator','MogKnight'],         price:8000 },
  // Daggers
  { slot:'w', name:'Rondell Dagger', atk:2,  range:1, ability:'Steal:Armor', ap:200, jobs:['Thief'],                         price:300 },
  { slot:'w', name:'Scramasax',      atk:3,  range:1, ability:'Steal:Shield',ap:200, jobs:['Thief'],                         price:400 },
  { slot:'w', name:'Knife',          atk:3,  range:1, ability:'Steal:Gil',    ap:100, jobs:['Thief','Juggler'],               price:250 },
  { slot:'w', name:'Sword Breaker',  atk:4,  range:1, ability:'Steal:Weapon',ap:300, jobs:['Thief'],                         price:800 },
  { slot:'w', name:'Orichalcum',     atk:5,  range:1, ability:'Steal:JP',     ap:200, jobs:['Thief'],                         price:1200 },
  { slot:'w', name:'Ninja Knife',    atk:4,  range:1, ability:'Throw',        ap:100, jobs:['Ninja'],                        price:900 },
  { slot:'w', name:'Kotetsu',        atk:5,  range:1, ability:'Wood Veil',    ap:200, jobs:['Ninja','Assassin'],             price:1100 },
  { slot:'w', name:'Masamune',       atk:8,  range:1, ability:'Oblivion',     ap:300, jobs:['Ninja','Assassin'],             price:3500 },
  { slot:'w', name:'Mage Masher',    atk:4,  range:1, ability:'Manastrike',   ap:300, jobs:['Fencer','RedMage'],             price:700 },
  // Spears / Polearms
  { slot:'w', name:'Javelin',        atk:5,  range:2, ability:'Jump',         ap:100, jobs:['Dragoon','Templar'],            price:600 },
  { slot:'w', name:'Spear',          atk:6,  range:2, ability:'Fire Breath',  ap:300, jobs:['Dragoon'],                      price:1000, elem:'fire' },
  { slot:'w', name:'Gae Bolg',       atk:8,  range:2, ability:'Bolt Breath',  ap:300, jobs:['Dragoon'],                      price:2000, elem:'thunder' },
  { slot:'w', name:'Trident',        atk:7,  range:2, ability:'Weapon Atk+',  ap:300, jobs:['Templar'],                      price:1800 },
  // Bows
  { slot:'w', name:'Shortbow',       atk:3,  range:5, ability:'Boost',        ap:100, jobs:['Archer'],                       price:300 },
  { slot:'w', name:'Longbow',        atk:4,  range:5, ability:'Take Aim',     ap:300, jobs:['Archer'],                       price:600 },
  { slot:'w', name:'Nail Bow',       atk:4,  range:5, ability:'Aim:Arm',      ap:200, jobs:['Archer'],                       price:500 },
  { slot:'w', name:'Artemis Bow',    atk:5,  range:6, ability:'Cupid',        ap:200, jobs:['Archer'],                       price:900 },
  { slot:'w', name:'Twin Bow',       atk:6,  range:5, ability:'Doubleshot',   ap:300, jobs:['Sniper','Hunter'],               price:1400 },
  { slot:'w', name:'Greatbow',       atk:7,  range:6, ability:'Aim:Vitals',   ap:300, jobs:['Hunter','Sniper'],              price:2000 },
  // Staves / Rods
  { slot:'w', name:'White Staff',    atk:2,  range:1, ability:'Cure',         ap:100, jobs:['WhiteMage','Bishop'],            price:200, mp:2 },
  { slot:'w', name:'Cure Staff',     atk:3,  range:1, ability:'Cura',         ap:200, jobs:['WhiteMage','Bishop','Summoner'], price:600, mp:3 },
  { slot:'w', name:'Pure Staff',     atk:3,  range:1, ability:'Esuna',        ap:200, jobs:['WhiteMage','Summoner'],         price:700, mp:3 },
  { slot:'w', name:'Bless Staff',    atk:4,  range:1, ability:'Life',         ap:200, jobs:['WhiteMage','Bishop'],            price:900, mp:4 },
  { slot:'w', name:'Nirvana Staff',  atk:5,  range:1, ability:'Full-Life',    ap:300, jobs:['WhiteMage','Bishop','Summoner'],price:2000, mp:5 },
  { slot:'w', name:'Rod',            atk:2,  range:1, ability:'Fire',          ap:100, jobs:['BlackMage','RedMage'],          price:200, mp:2 },
  { slot:'w', name:'Firewheel Rod',  atk:3,  range:1, ability:'Fira',         ap:200, jobs:['BlackMage','TimeMage','Illusionist'],price:600, mp:3 },
  { slot:'w', name:'Thunder Rod',    atk:3,  range:1, ability:'Thundara',     ap:200, jobs:['BlackMage','Illusionist'],      price:600, mp:3 },
  { slot:'w', name:'Chill Rod',      atk:4,  range:1, ability:'Blizzara',     ap:200, jobs:['BlackMage','Illusionist','TimeMage'],price:800, mp:3 },
  { slot:'w', name:'Stardust Rod',   atk:5,  range:1, ability:'Demi',         ap:300, jobs:['Illusionist','TimeMage'],       price:2000, mp:5 },
  // Knuckles (White Monk)
  { slot:'w', name:'Hard Knuckles',  atk:3,  range:1, ability:'Whirlwind',    ap:100, jobs:['WhiteMonk','Gadgeteer'],        price:400 },
  { slot:'w', name:'Kaiser Knuckles',atk:5,  range:1, ability:'Air Render',   ap:200, jobs:['WhiteMonk'],                    price:800 },
  { slot:'w', name:'Cat Claws',      atk:4,  range:1, ability:'Chakra',       ap:200, jobs:['WhiteMonk','Gadgeteer'],        price:600 },
  { slot:'w', name:'Godhand',        atk:7,  range:1, ability:'Far Fist',     ap:200, jobs:['WhiteMonk'],                    price:2000 },
  { slot:'w', name:'Rising Sun',     atk:6,  range:1, ability:'Exorcise',     ap:300, jobs:['WhiteMonk','Gadgeteer'],        price:1500 },
  // Guns (Moogle)
  { slot:'w', name:'Fireshot Gun',   atk:4,  range:5, ability:'Fireshot',     ap:100, jobs:['Gunner'],                       price:600, elem:'fire' },
  { slot:'w', name:'Boltshot Gun',   atk:4,  range:5, ability:'Boltshot',     ap:100, jobs:['Gunner'],                       price:600, elem:'thunder' },
  { slot:'w', name:'Iceshot Gun',    atk:4,  range:5, ability:'Iceshot',      ap:100, jobs:['Gunner'],                       price:600, elem:'ice' },
  { slot:'w', name:'Silver Cannon',  atk:5,  range:5, ability:'Blindshot',    ap:100, jobs:['Gunner'],                       price:1000 },
  { slot:'w', name:'Chaos Rifle',    atk:6,  range:5, ability:'Confushot',    ap:200, jobs:['Gunner'],                       price:1800 },
  // Maces (Nu Mou)
  { slot:'w', name:'Druid Mace',     atk:4,  range:1, ability:'Blind',        ap:100, jobs:['Sage','Alchemist'],              price:500 },
  { slot:'w', name:'Energy Mace',    atk:5,  range:1, ability:'Rasp',         ap:100, jobs:['Alchemist','Sage'],              price:800 },
  { slot:'w', name:'Lotus Mace',     atk:7,  range:1, ability:'Flare',        ap:300, jobs:['Alchemist','Sage'],              price:2500 },
  { slot:'w', name:'Life Crosier',   atk:5,  range:1, ability:'Death',        ap:300, jobs:['Alchemist','Sage'],              price:2000 },
  { slot:'w', name:'Mandragora',     atk:5,  range:1, ability:'Toad',         ap:200, jobs:['Alchemist'],                     price:1500 },
  // Instruments (Animist / Beastmaster)
  { slot:'w', name:'Glass Bell',     atk:3,  range:3, ability:'Sheep Count',  ap:100, jobs:['Animist','Beastmaster'],         price:400 },
  { slot:'w', name:'Fairy Harp',     atk:4,  range:3, ability:'Tail Wag',     ap:200, jobs:['Animist','Beastmaster'],         price:800 },
  { slot:'w', name:'War Trumpet',    atk:5,  range:3, ability:'Catnip',       ap:100, jobs:['Animist','Beastmaster'],         price:600 },
  // ARMOR
  { slot:'a', name:'Leather Armor',  def:2,  mres:1, ability:null,                       price:200 },
  { slot:'a', name:'Bronze Armor',   def:4,  mres:2, ability:'Defend',         ap:100,   price:400 },
  { slot:'a', name:'Chain Mail',     def:5,  mres:2, ability:null,                       price:600 },
  { slot:'a', name:'Mythril Armor',  def:6,  mres:3, ability:'Protect',        ap:200,   price:1200 },
  { slot:'a', name:'Plate Armor',    def:8,  mres:4, ability:'Shell',          ap:200,   price:1800 },
  { slot:'a', name:'Diamond Armor',  def:7,  mres:3, ability:'Weapon Def+',    ap:300,   price:2500 },
  { slot:'a', name:'Genji Armor',    def:9,  mres:5, ability:'Reflex',         ap:300,   price:4000 },
  { slot:'a', name:'White Robe',     def:3,  mres:5, ability:'Turbo MP',       ap:300,   price:2000 },
  { slot:'a', name:'Black Robe',     def:3,  mres:5, ability:'Return Magic',   ap:300,   price:2000 },
  { slot:'a', name:'Light Robe',     def:2,  mres:5, ability:'Half MP',        ap:300,   price:2200 },
  { slot:'a', name:'Survival Vest',  def:4,  mres:4, ability:'Immunity',       ap:300,   price:2800 },
  { slot:'a', name:'Ninja Gear',     def:3,  mres:2, ability:'Last Haste',     ap:300,   price:1500 },
  { slot:'a', name:'Green Beret',    def:2,  mres:2, ability:'Block Arrows',   ap:300,   price:800 },
  { slot:'a', name:'Gaia Gear',      def:4,  mres:3, ability:'Auto-Regen',     ap:300,   price:2000 },
  { slot:'a', name:'Chain Plate',    def:5,  mres:3, ability:'Catch',          ap:300,   price:1500 },
  { slot:'a', name:'Brigandine',     def:4,  mres:3, ability:'Counter',        ap:300,   price:1200 },
  { slot:'a', name:'Power Sash',     def:3,  mres:3, ability:'Return Fire',    ap:300,   price:1600 },
  { slot:'a', name:'Mirage Vest',    def:2,  mres:3, ability:'Reflex',         ap:300,   price:1400 },
  { slot:'a', name:'Gold Armor',     def:6,  mres:4, ability:'Last Haste',     ap:300,   price:3000 },
  { slot:'a', name:'Carabini Mail',  def:7,  mres:4, ability:'Bonecrusher',    ap:300,   price:3200 },
  // Shields (learn Shieldbearer)
  { slot:'a', name:'Bronze Shield',  def:2,  mres:1, ability:'Shieldbearer',   ap:300,   price:300 },
  { slot:'a', name:'Round Shield',   def:3,  mres:2, ability:'Shieldbearer',   ap:300,   price:600 },
  { slot:'a', name:'Opal Shield',    def:4,  mres:3, ability:'Shieldbearer',   ap:300,   price:1000 }
];

// ── ABILITY CATALOG ───────────────────────────────────────────────────
const ABILS = {
  // Each job has categories: C=Combat, W=White, B=Black, T=Time, R=Ranged, M=Martial, S=Steal, N=Ninja, L=Blue, I=Illusion, P=Prayer, Q=Summon, D=Dragoon, F=Fencer, A=Animist, G=Gunner, J=Juggler, E=Gadgeteer
  Soldier:['C','S'], Paladin:['C','W','P'], Fighter:['C','M'],
  Thief:['S','C'], Ninja:['N','C'], Archer:['R','C'], Hunter:['R','H','C'],
  WhiteMage:['W','C'], BlackMage:['B','C'], Illusionist:['I','B','W'],
  BlueMage:['L','C'], Warrior:['C','S'], Dragoon:['D','C'], Defender:['C','P'],
  Gladiator:['C','M'], WhiteMonk:['M','W','C'], Bishop:['P','W'], Templar:['P','C'],
  TimeMage:['T','B','C'], Alchemist:['A','B','W'], Beastmaster:['H','C'],
  Morpher:['M','C'], Sage:['W','B','T','C'], Fencer:['F','C'],
  Elementalist:['E','C'], RedMage:['R','W','B'], Summoner:['Q','W'],
  Assassin:['N','R','C'], Sniper:['R','C'], Animist:['A','W','C'],
  MogKnight:['C','W'], Gunner:['G','C'], Juggler:['J','C'], Gadgeteer:['E','C']
};

const ABILITY_CAT = {
  C:{name:'Combat',color:'#ff7a3c'}, S:{name:'Battle Tech',color:'#ff9a5e'},
  W:{name:'White Magic',color:'#00ff9c'}, B:{name:'Black Magic',color:'#9c5fff'},
  M:{name:'Martial',color:'#e8c45c'}, R:{name:'Bow',color:'#5fe0ff'},
  N:{name:'Ninja Skill',color:'#b07cff'}, T:{name:'Time Magic',color:'#ffd700'},
  I:{name:'Illusion',color:'#c08cff'}, L:{name:'Blue Magic',color:'#ff5a9e'},
  P:{name:'Prayer/Sacred',color:'#e8c45c'}, D:{name:'Dragon Tech',color:'#ff7a3c'},
  F:{name:'Lunge Tech',color:'#5fe0ff'}, E:{name:'Spirit Magic',color:'#c9a6ff'},
  Q:{name:'Summon',color:'#ff5a9e'}, A:{name:'Alchemy/Animist',color:'#a78bfa'},
  H:{name:'Beast',color:'#8b6c3f'}, G:{name:'Gun',color:'#ff9a5e'},
  J:{name:'Stunt',color:'#ffd700'}
};

const ABILITIES = [
  // COMBAT (Fight)
  { name:'Fight', cat:'C', mp:0,  power:1.0, range:1, target:'enemy', elem:null,  status:null, desc:'Strike with equipped weapon' },
  { name:'Defend', cat:'C', mp:0, power:0, range:0, target:'self', elem:null, status:null, desc:'Raise defense 40%, skip turn' },
  // WHITE MAGIC
  { name:'Cure', cat:'W', mp:4, power:10, range:4, target:'ally', elem:null, status:null, heal:true, desc:'Restore HP (Power 10)' },
  { name:'Cura', cat:'W', mp:8, power:22, range:4, target:'ally', elem:null, status:null, heal:true, desc:'Restore HP (Power 22)' },
  { name:'Curaga', cat:'W', mp:16, power:50, range:4, target:'ally', elem:null, status:null, heal:true, desc:'Restore HP (Power 50)' },
  { name:'Esuna', cat:'W', mp:6, power:0, range:3, target:'ally', elem:null, status:null, heal:false, desc:'Cure all status ailments' },
  { name:'Life', cat:'W', mp:12, power:0, range:3, target:'ally', elem:null, status:null, heal:true, revive:true, desc:'Revive with 50% HP' },
  { name:'Protect', cat:'W', mp:4, power:0, range:3, target:'ally', elem:null, status:null, heal:false, buff:'def', desc:'Raise WDef 40%' },
  { name:'Shell', cat:'W', mp:4, power:0, range:3, target:'ally', elem:null, status:null, heal:false, buff:'mres', desc:'Raise MRes 40%' },
  // BLACK MAGIC
  { name:'Fire', cat:'B', mp:4, power:9, range:4, target:'enemy', elem:'fire', status:null, desc:'Weak fire damage' },
  { name:'Fira', cat:'B', mp:8, power:16, range:4, target:'enemy', elem:'fire', status:null, desc:'Average fire damage' },
  { name:'Firaga', cat:'B', mp:16, power:28, range:4, target:'enemy', elem:'fire', status:null, desc:'Strong fire damage' },
  { name:'Thunder', cat:'B', mp:4, power:10, range:4, target:'enemy', elem:'thunder', status:null, desc:'Weak thunder damage' },
  { name:'Thundara', cat:'B', mp:8, power:17, range:4, target:'enemy', elem:'thunder', status:null, desc:'Average thunder damage' },
  { name:'Blizzard', cat:'B', mp:4, power:9, range:4, target:'enemy', elem:'ice', status:null, desc:'Weak ice damage' },
  { name:'Blizzara', cat:'B', mp:8, power:16, range:4, target:'enemy', elem:'ice', status:null, desc:'Average ice damage' },
  { name:'Poison', cat:'B', mp:4, power:0, range:4, target:'enemy', elem:null, status:'poison', chance:0.55, desc:'Inflict Poison' },
  // ILLUSION
  { name:'Sleep', cat:'I', mp:5, power:0, range:4, target:'enemy', elem:null, status:'sleep', chance:0.5, desc:'Inflict Sleep' },
  { name:'Blind', cat:'I', mp:4, power:0, range:4, target:'enemy', elem:null, status:'blind', chance:0.55, desc:'Inflict Blind' },
  { name:'Silence', cat:'I', mp:4, power:0, range:4, target:'enemy', elem:null, status:'silence', chance:0.55, desc:'Block magic' },
  { name:'Confuse', cat:'I', mp:8, power:0, range:3, target:'enemy', elem:null, status:'confuse', chance:0.4, desc:'Random attacks' },
  { name:'Disable', cat:'I', mp:6, power:0, range:3, target:'enemy', elem:null, status:'disable', chance:0.5, desc:'Block actions' },
  // TIME MAGIC
  { name:'Haste', cat:'T', mp:6, power:0, range:3, target:'ally', elem:null, status:null, buff:'spd', desc:'Double speed' },
  { name:'Slow', cat:'T', mp:6, power:0, range:4, target:'enemy', elem:null, status:'slow', chance:0.6, desc:'Halve speed' },
  { name:'Stop', cat:'T', mp:10, power:0, range:4, target:'enemy', elem:null, status:'stop', chance:0.4, desc:'Skip turns' },
  { name:'Reflect', cat:'T', mp:8, power:0, range:3, target:'ally', elem:null, status:null, buff:'reflect', desc:'Reflect magic' },
  { name:'Demi', cat:'T', mp:10, power:0, range:4, target:'enemy', elem:null, status:null, demi:true, desc:'Halve target HP' },
  // MARTIAL ARTS
  { name:'Chakra', cat:'M', mp:0, power:20, range:0, target:'self', elem:null, status:null, heal:true, desc:'Restore HP + cure status' },
  { name:'Whirlwind', cat:'M', mp:0, power:8, range:1, target:'enemy', elem:'wind', status:null, aoe:'adjacent', desc:'All adjacent damage' },
  { name:'Shockwave', cat:'M', mp:0, power:10, range:2, target:'enemy', elem:'earth', status:null, desc:'Earth-pulse strike' },
  // BATTLE TECH
  { name:'Provoke', cat:'S', mp:0, power:0, range:2, target:'enemy', elem:null, status:'berserk', chance:0.6, desc:'Inflict Berserk' },
  { name:'Powerbreak', cat:'S', mp:0, power:6, range:1, target:'enemy', elem:null, debuff:'watk', desc:'Lower WAtk' },
  { name:'Speedbreak', cat:'S', mp:0, power:6, range:1, target:'enemy', elem:null, debuff:'spd', desc:'Lower Speed' },
  { name:'Mug', cat:'S', mp:0, power:8, range:1, target:'enemy', elem:null, status:null, steal:true, desc:'Damage + steal gil' },
  // LUNGE TECH (Fencer)
  { name:'Swarmstrike', cat:'F', mp:0, power:6, range:1, target:'enemy', elem:null, status:'poison', chance:0.4, desc:'Half damage + Poison' },
  { name:'Shadowstick', cat:'F', mp:0, power:7, range:1, target:'enemy', elem:null, debuff:'spd', desc:'Reduce speed' },
  { name:'Nighthawk', cat:'F', mp:0, power:9, range:2, target:'enemy', elem:null, status:null, desc:'Wide ranged attack' },
  // STEAL (Thief)
  { name:'Steal Gil', cat:'S', mp:0, power:0, range:1, target:'enemy', elem:null, stealgil:true, desc:'Steal gil' },
  { name:'Steal Weapon', cat:'S', mp:0, power:0, range:1, target:'enemy', elem:null, steal:'weapon', desc:'Steal equipped weapon' },
  // DRAGON TECH
  { name:'Jump Up', cat:'D', mp:0, power:14, range:99,target:'enemy', elem:null, status:null, desc:'Leap from sky' },
  { name:'Fire Breath', cat:'D', mp:4, power:12, range:2, target:'enemy', elem:'fire', status:null, aoe:'t', desc:'T-area fire' },
  // SUMMON
  { name:'Ifrit', cat:'Q', mp:18, power:24, range:5, target:'enemy', elem:'fire', status:null, desc:'Fire esper' },
  { name:'Shiva', cat:'Q', mp:18, power:24, range:5, target:'enemy', elem:'ice', status:null, desc:'Ice esper' },
  { name:'Ramuh', cat:'Q', mp:18, power:24, range:5, target:'enemy', elem:'thunder', status:null, desc:'Thunder esper' },
  { name:'Unicorn', cat:'Q', mp:12, power:30, range:5, target:'ally', elem:null, status:null, heal:true, desc:'Heal all + cure status' },
  // BLUE MAGIC
  { name:'Goblin Punch', cat:'L', mp:4, power:8, range:1, target:'enemy', elem:null, status:null, desc:'Humiliating strike' },
  { name:'Bad Breath', cat:'L', mp:8, power:0, range:3, target:'enemy', elem:null, status:'poison', chance:0.6, desc:'Multiple statuses' },
  { name:'White Wind', cat:'L', mp:8, power:40, range:4, target:'ally', elem:null, status:null, heal:true, desc:'Heal = current HP' },
  // GUNNER
  { name:'Fireshot', cat:'G', mp:0, power:7, range:5, target:'enemy', elem:'fire', status:null, desc:'Fire bullet' },
  { name:'Boltshot', cat:'G', mp:0, power:7, range:5, target:'enemy', elem:'thunder', status:null, desc:'Thunder bullet' },
  { name:'Iceshot', cat:'G', mp:0, power:7, range:5, target:'enemy', elem:'ice', status:null, desc:'Ice bullet' },
  { name:'Silenshot', cat:'G', mp:0, power:5, range:5, target:'enemy', elem:null, status:'silence', chance:0.5, desc:'Attack + Silence' },
  // STUNT (Juggler)
  { name:'Gil Toss', cat:'J', mp:0, power:0, range:4, target:'enemy', elem:null, gildmg:true, desc:'Throw gil for damage' },
  { name:'Firebomb', cat:'J', mp:0, power:10, range:3, target:'enemy', elem:'fire', status:'berserk', chance:0.3, desc:'Fire + Berserk' },
  // GADGETEER
  { name:'Red Spring', cat:'E', mp:4, power:0, range:99, target:'ally', elem:null, status:null, buff:'spd', aoe:'all', desc:'Haste all allies' },
  { name:'Green Gear', cat:'E', mp:4, power:0, range:99, target:'enemy', elem:null, status:'poison', chance:0.6, aoe:'all', desc:'Poison all enemies' },
  // AGENT ABILITIES
  { name:'Supreme Command', cat:'X', mp:10, power:0,  range:99, target:'ally', elem:null, status:null, aoe:'all', buff:'atk', buffVal:0.5, desc:'Raise all allies ATK 50% for 3 turns' },
  { name:'System Override', cat:'X', mp:14, power:30, range:5,  target:'enemy', elem:null, status:null, aoe:'all', desc:'Massive AoE damage to all enemies' },
  { name:'Gold Rush',       cat:'X', mp:6,  power:0,  range:4,  target:'enemy', elem:null, status:null, gildmg:true, desc:'Throw gold coins — damage scales with wealth' },
  { name:'Future Sight',    cat:'X', mp:8,  power:0,  range:0,  target:'self',  elem:null, status:null, buff:'crit', buffVal:1.0, desc:'Next attack auto-crits' },
  { name:'Pixel Storm',     cat:'X', mp:10, power:18, range:5,  target:'enemy', elem:null, status:'confuse', aoe:'t', chance:0.5, desc:'AoE damage + Confuse' },
  { name:'Power Word',      cat:'X', mp:8,  power:12, range:4,  target:'enemy', elem:null, status:'disable', chance:0.6, desc:'Damage + Disable' },
  { name:'Barrier Protocol',cat:'X', mp:12, power:0,  range:99, target:'ally',  elem:null, status:null, aoe:'all', buff:'def', buffVal:0.5, desc:'Raise all allies DEF 50% for 3 turns' }
];

// ── AGENT ABILITIES ─────────────────────────────────────────────────
// 7 unique abilities for the 7 legendary agents
const AGENT_ABILITIES = {
  shaddai: { name:'Supreme Command', cat:'X', mp:10, power:0,  range:99, target:'ally', elem:null, status:null, aoe:'all', buff:'atk', buffVal:0.5, desc:'Raise all allies ATK 50% for 3 turns' },
  nexus:   { name:'System Override', cat:'X', mp:14, power:30, range:5,  target:'enemy', elem:null, status:null, aoe:'all', desc:'Massive AoE damage to all enemies' },
  zerox:   { name:'Gold Rush',       cat:'X', mp:6,  power:0,  range:4,  target:'enemy', elem:null, status:null, gildmg:true, desc:'Throw gold coins — damage scales with wealth' },
  oracle:  { name:'Future Sight',    cat:'X', mp:8,  power:0,  range:0,  target:'self',  elem:null, status:null, buff:'crit', buffVal:1.0, desc:'Next attack auto-crits' },
  turtle:  { name:'Pixel Storm',     cat:'X', mp:10, power:18, range:5,  target:'enemy', elem:null, status:'confuse', aoe:'t', chance:0.5, desc:'AoE damage + Confuse' },
  quill:   { name:'Power Word',      cat:'X', mp:8,  power:12, range:4,  target:'enemy', elem:null, status:'disable', chance:0.6, desc:'Damage + Disable' },
  pikadon: { name:'Barrier Protocol',cat:'X', mp:12, power:0,  range:99, target:'ally',  elem:null, status:null, aoe:'all', buff:'def', buffVal:0.5, desc:'Raise all allies DEF 50% for 3 turns' }
};

// ── AGENT UNITS ──────────────────────────────────────────────────────
// The 7 legendary agents — each with unique stats, job, and abilities
const AGENT_UNITS = [
  { id:'shaddai', name:'SHADDAI',  race:'Human',  job:'Orchestrator',  agentColor:'#ffd700',
    hp:24, mp:12, watk:7, wdef:5, mpow:7, mres:6, spd:6, jump:2, move:4,
    ability:'supreme_command', desc:'The Supreme Orchestrator — leads from the front' },
  { id:'nexus',   name:'NEXUS',    race:'NuMou',  job:'Architect',     agentColor:'#00bfff',
    hp:18, mp:16, watk:5, wdef:4, mpow:10, mres:7, spd:5, jump:2, move:4,
    ability:'system_override', desc:'The Technical Architect — rewrites reality' },
  { id:'zerox',   name:'ZEROX',    race:'Moogle', job:'Magnate',       agentColor:'#ffd700',
    hp:16, mp:10, watk:4, wdef:3, mpow:6, mres:4, spd:8, jump:3, move:5,
    ability:'gold_rush', desc:'The Wealth Engine — riches are his weapon' },
  { id:'oracle',  name:'ORACLE',   race:'Viera',  job:'Seer',          agentColor:'#c9a6ff',
    hp:16, mp:14, watk:4, wdef:3, mpow:9, mres:8, spd:6, jump:2, move:4,
    ability:'future_sight', desc:'The Research Engine — knows what comes next' },
  { id:'turtle',  name:'TURTLE',   race:'Moogle', job:'Artisan',       agentColor:'#ff9ee8',
    hp:18, mp:10, watk:6, wdef:5, mpow:6, mres:5, spd:7, jump:3, move:4,
    ability:'pixel_storm', desc:'The UI/UX Designer — creates chaos beautifully' },
  { id:'quill',   name:'QUILL',    race:'Human',  job:'Scribe',        agentColor:'#5fe0ff',
    hp:16, mp:12, watk:5, wdef:4, mpow:8, mres:6, spd:6, jump:2, move:4,
    ability:'power_word', desc:'The Wordsmith — words cut deeper than swords' },
  { id:'pikadon', name:'PIKADON',  race:'Bangaa', job:'Warden',        agentColor:'#ff7a3c',
    hp:28, mp:8,  watk:6, wdef:10, mpow:3, mres:7, spd:4, jump:2, move:3,
    ability:'barrier_protocol', desc:'The Security Engine — impenetrable defense' }
];

// ── STATUS AILMENTS ──────────────────────────────────────────────────
const AILMENTS = {
  poison:    { name:'Poison',   color:'#a78bfa', tick:true,  tickDmg:0.08, desc:'8% max HP per turn' },
  blind:     { name:'Blind',    color:'#5fe0ff', atkMod:0.5, evadePenalty:50, desc:'Halve accuracy' },
  silence:   { name:'Silence',  color:'#ff5a4d', blockMagic:true, desc:'Cannot use magic' },
  sleep:     { name:'Sleep',    color:'#c08cff', skipTurn:true, wakeOnHit:true, desc:'Skip turn, wake on attack' },
  stop:      { name:'Stop',     color:'#ffd700', skipTurn:true, desc:'Skip turns' },
  confuse:   { name:'Confuse',  color:'#ff7a3c', randomTarget:true, desc:'Attack random target' },
  disable:   { name:'Disable',  color:'#ff9a5e', blockAct:true, desc:'Cannot act' },
  berserk:   { name:'Berserk',  color:'#ff5a4d', forceFight:true, atkBonus:0.2, desc:'Auto-attack x1.2' },
  frog:      { name:'Frog',     color:'#00ff9c', atkMod:0.1, magMod:0.1, desc:'90% stat penalty' },
  charm:     { name:'Charm',    color:'#ff5a9e', teamSwap:true, desc:'Fight for enemies' },
  slow:      { name:'Slow',     color:'#ffd700', spdMod:0.5, desc:'Halve speed' },
  regen:     { name:'Regen',    color:'#00ff9c', tick:true,  tickHeal:0.1, desc:'10% HP per turn' }
};

// ── ENEMY CLANS ──────────────────────────────────────────────────────
// FFTA-inspired rival clans, each with a theme color and description
const ENEMY_CLANS = {
  nutsy:      { name:'Clan Nutsy',      color:'#c8a050', desc:'Small-time thugs scraping by' },
  borzoi:     { name:'Clan Borzoi',     color:'#7a8ab8', desc:'Speedy raiders from the plains' },
  cheetahs:   { name:'Clan Cheetahs',   color:'#e8a830', desc:'Savage hunters with claws out' },
  deepwood:   { name:'Clan Deepwood',   color:'#3a7a3a', desc:'Forest-dwelling survivalists' },
  crimson:    { name:'Crimson Wing',    color:'#c02020', desc:'Elite mercenary company' },
  northern:   { name:'Northern Sky',    color:'#4060a0', desc:'Cold-clan warriors from the Jagd' },
  scorpion:   { name:'Clan Scorpion',   color:'#909030', desc:'Poison-blade assassins' },
  jade:       { name:'Clan Jade',       color:'#30a060', desc:'Mysterious faction from the east' },
  hollow:     { name:'The Hollow',      color:'#603090', desc:'Void-touched undead clan' },
  cloaked:    { name:'The Cloaked Ones',color:'#404060', desc:'Secretive mage cabal' },
  undying:    { name:'The Undying',     color:'#804040', desc:'Zombie legion that never falls' },
  beastmasters:{name:'The Beastmasters',color:'#608020', desc:'Monster-taming wild clan' },
  forlorn:    { name:'The Forlorn Hope',color:'#707070', desc:'Desperate clan with nothing to lose' },
  talekickers:{ name:'The Talekickers', color:'#b06020', desc:'Brawlers who talk big and hit hard' },
  spirit:     { name:'The Spirit',      color:'#c0c0ff', desc:'Mythical clan of legend' }
};

// ── PLAYER CLAN NAMES ───────────────────────────────────────────────
const CLAN_NAMES = [
  'Diamond Sword','Crystal Guard','Lawbringers','Moonlit Blades',
  'Stormrunners','Ashen Wolves','The Vanguard','Golden Chevron',
  'The Freeblades','The Wild Roses'
];

// ── STORY MISSIONS (FFTA-inspired) ──────────────────────────────────
const STORY_MISSIONS = [
  // ── Chapter 1: Into Ivalice ──
  { num:1, level:1, clan:'nutsy',  enemies:3, boss:false,
    name:'A New World',
    desc:'You wake in a strange land. A group of ruffians blocks the path ahead — time to test your blade.',
    loc:'Cyril Fields',         rewardGil:50,   rewardItem:null },
  { num:2, level:1, clan:'nutsy',  enemies:4, boss:false,
    name:'The Wanted Fugitive',
    desc:'A thief from Clan Nutsy has been spotted in the eastern vale. Bring him to justice.',
    loc:'Eastern Vale',          rewardGil:70,   rewardItem:'Potion' },
  { num:3, level:2, clan:'borzoi', enemies:4, boss:false,
    name:'Bandit Ambush',
    desc:'Clan Borzoi has set up a roadblock demanding tolls. The merchants need protection.',
    loc:"King's Gate",           rewardGil:90,   rewardItem:'Hi-Potion' },
  { num:4, level:2, clan:'borzoi', enemies:4, boss:false,
    name:'Rescue the Moogle',
    desc:'A young Moogle trader has been captured by Borzoi raiders. Infiltrate their camp and free them.',
    loc:'Borzoi Camp',           rewardGil:100,  rewardItem:'Antidote' },
  { num:5, level:3, clan:'cheetahs',enemies:5, boss:false,
    name:'The Crystal\'s Call',
    desc:'A strange crystal pulses in the ruins. Clan Cheetahs wants its power — reach it first.',
    loc:'Crystal Ruins',         rewardGil:120,  rewardItem:'Ether' },
  { num:6, level:3, clan:'cheetahs',enemies:5, boss:true,
    name:'Rumble in the Vale',
    desc:'Cheetahs\' leader, a scarred Bangaa named Gorr, challenges you to a duel for the crystal shard.',
    loc:'Crystal Vale',          rewardGil:150,  rewardItem:'Bronze Armor' },

  // ── Chapter 2: Laws of Ivalice ──
  { num:7, level:4, clan:'crimson',enemies:5, boss:false,
    name:'The Judge\'s Test',
    desc:'A Judge appears and declares a Law upon the battlefield. Fight within the rules to prove your honor.',
    loc:'Lutia Pass',            rewardGil:160,  rewardItem:'Echo Grass' },
  { num:8, level:4, clan:'scorpion',enemies:5, boss:false,
    name:'Stolen Law Card',
    desc:'Clan Scorpion has stolen a rare Law Card from the Judge\'s vault. Retrieve it before it\'s sold.',
    loc:'Scorpion Den',          rewardGil:180,  rewardItem:'Remedy' },
  { num:9, level:5, clan:'northern',enemies:6, boss:false,
    name:'Smuggler\'s Cove',
    desc:'Northern Sky runs a smuggling operation through the Jagd coast. Shut it down.',
    loc:'Jagd Coast',            rewardGil:200,  rewardItem:'Mage Masher' },
  { num:10,level:5, clan:'jade',   enemies:6, boss:true,
    name:'Arena of Law',
    desc:'Clan Jade\'s champion awaits in the arena. Three Laws are in effect — break them at your peril.',
    loc:'Cyril Arena',           rewardGil:220,  rewardItem:'Power Armlet' },
  { num:11,level:6, clan:'hollow', enemies:6, boss:false,
    name:'Phantom Forest',
    desc:'The Hollow has been raising the dead in the ancient woods. Put the spirits to rest.',
    loc:'Phantom Woods',         rewardGil:250,  rewardItem:'Hi-Ether' },
  { num:12,level:6, clan:'crimson',enemies:7, boss:true,
    name:'Theatre Daze',
    desc:'Crimson Wing\'s commander, a deadly Viera named Vesna, puts on a bloody show at the old theatre.',
    loc:'Abandoned Theatre',     rewardGil:280,  rewardItem:'Buster Sword' },

  // ── Chapter 3: The Totema ──
  { num:13,level:7, clan:'cloaked',enemies:7, boss:false,
    name:'Mateus Awakens',
    desc:'The Cloaked Ones summon the ice totema Mateus in a frozen cathedral. Disrupt the ritual.',
    loc:'Frozen Cathedral',      rewardGil:300,  rewardItem:'Law Card: No Fire' },
  { num:14,level:7, clan:'undying',enemies:7, boss:false,
    name:'Famfrit\'s Tidal Wave',
    desc:'The Undying channel the tidal totema Famfrit. Flood waters rise — stop them at the dam.',
    loc:'Cyril Dam',             rewardGil:320,  rewardItem:'Icebrand' },
  { num:15,level:8, clan:'deepwood',enemies:8, boss:false,
    name:'Exodus of the Viera',
    desc:'Clan Deepwood captures Viera elders for their knowledge. Fight through the forest stronghold.',
    loc:'Ancient Redwood',       rewardGil:350,  rewardItem:'Flame Shield' },
  { num:16,level:8, clan:'beastmasters',enemies:8, boss:true,
    name:'Adrammelech\'s Storm',
    desc:'The Beastmasters unleash the storm totema. Their leader, a Nu Mou named Zephiel, commands the sky.',
    loc:'Stormpeak',             rewardGil:380,  rewardItem:'Rune Blade' },
  { num:17,level:9, clan:'spirit', enemies:8, boss:false,
    name:'Ultima\'s Wisdom',
    desc:'A spectral clan guards the forbidden knowledge of Ultima. Prove your worth through combat.',
    loc:'Library of the Ancients',rewardGil:400,  rewardItem:'Law Card: No Magic' },
  { num:18,level:9, clan:'talekickers',enemies:9, boss:true,
    name:'Twin Moogle Crisis',
    desc:'The Talekickers have captured two Moogle siblings. Their leader, a loudmouth named Brundo, demands a fight.',
    loc:'Moogle Village',        rewardGil:430,  rewardItem:'Ribbon' },

  // ── Chapter 4: The Final Stand ──
  { num:19,level:10,clan:'forlorn',enemies:9, boss:false,
    name:'Siege of the Capital',
    desc:'The Forlorn Hope lays siege to Cyril. Defend the city gates with everything you\'ve got.',
    loc:'Cyril Gates',           rewardGil:460,  rewardItem:'Defender' },
  { num:20,level:10,clan:'hollow', enemies:9, boss:true,
    name:'The Jagd Invasion',
    desc:'The Hollow opens a Jagd rift, flooding the land with monsters. Their lich commander must fall.',
    loc:'Jagd Rift',             rewardGil:500,  rewardItem:'Law Card: No Heal' },
  { num:21,level:11,clan:'undying',enemies:10,boss:false,
    name:'Symphony of Souls',
    desc:'The Undying perform a necromantic symphony to bring forth a fourth totema. Disrupt the choir of the damned.',
    loc:'Graveyard of Crystals', rewardGil:550,  rewardItem:'Excalibur' },
  { num:22,level:11,clan:'spirit', enemies:10,boss:false,
    name:'Clan War: Final',
    desc:'All surviving enemy clans converge for a massive free-for-all. Only one clan walks away.',
    loc:'Crystal Plains',        rewardGil:600,  rewardItem:'Genji Helm' },
  { num:23,level:12,clan:'cloaked',enemies:11,boss:false,
    name:'Heart of the Crystal',
    desc:'The Cloaked Ones have reached the Heart Crystal. Break through their defenses before the ritual completes.',
    loc:'Crystal Sanctum',       rewardGil:650,  rewardItem:'Save the Queen' },
  { num:24,level:12,clan:'spirit', enemies:12,boss:true,
    name:'Final Battle: Genesis',
    desc:'The Spirit\'s master, a being of pure crystal, awakens. The fate of Ivalice rests on this final clash.',
    loc:'Genesis Gate',          rewardGil:1000, rewardItem:'Legendary Sword' }
];

const DISPATCH = [
  { id:'d1',name:'Hunt the Hare',    days:2, skill:'Com', reward:30, ap:2,  successWalk:0.7 },
  { id:'d2',name:'Tail the Trader',  days:3, skill:'Mag', reward:40, ap:3,  successWalk:0.65 },
  { id:'d3',name:'Investigate Ruins',days:4, skill:'Gth', reward:50, ap:4,  successWalk:0.55 },
  { id:'d4',name:'Deliver Goods',    days:5, skill:'Neg', reward:70, ap:5,  successWalk:0.5 },
  { id:'d5',name:'Sweep the Mines',  days:6, skill:'Com', reward:90, ap:6,  successWalk:0.4 }
];

const ENCOUNTERS = [
  { id:'e1',name:'Rival: Clan Nutsy',      clan:'nutsy',  level:2,  enemies:5 },
  { id:'e2',name:'Rival: Clan Borzoi',     clan:'borzoi', level:3,  enemies:6 },
  { id:'e3',name:'Rival: Crimson Wing',    clan:'crimson',level:5,  enemies:7 },
  { id:'e4',name:'Rival: Clan Scorpion',   clan:'scorpion',level:6, enemies:8 },
  { id:'e5',name:'Rival: Northern Sky',    clan:'northern',level:7, enemies:9 },
  { id:'e6',name:'Rival: Clan Deepwood',   clan:'deepwood',level:8, enemies:10 },
  { id:'e7',name:'Rival: The Hollow',      clan:'hollow', level:9, enemies:11 },
  { id:'e8',name:'Rival: The Undying',     clan:'undying',level:10,enemies:12 }
];

// ── LAWS ─────────────────────────────────────────────────────────────
const LAW_POOL = [
  { id:'no_fire',   label:'No Fire',       restrict:a=>a.elem==='fire',    jp:2, desc:'Fire-element attacks banned' },
  { id:'no_ice',    label:'No Ice',        restrict:a=>a.elem==='ice',     jp:2, desc:'Ice-element attacks banned' },
  { id:'no_thunder',label:'No Thunder',    restrict:a=>a.elem==='thunder', jp:2, desc:'Thunder-element attacks banned' },
  { id:'no_heal',   label:'No Healing',    restrict:a=>a.heal===true,      jp:2, desc:'Healing magic banned' },
  { id:'no_jump',   label:'No Jump',       restrict:a=>a.cat==='D',        jp:2, desc:'Jump/Dragon skills banned' },
  { id:'no_bows',   label:'No Bows',       restrict:a=>a.cat==='R',        jp:2, desc:'Ranged attacks banned' },
  { id:'no_fight',  label:'No Fight',      restrict:a=>a.name==='Fight',   jp:2, desc:'Fight command banned' },
  { id:'no_magic',  label:'No Magic',      restrict:a=>a.mp>0,             jp:3, desc:'All magic banned' },
  { id:'no_status', label:'No Status',     restrict:a=>a.status!==null,    jp:2, desc:'Status-inflicting abilities banned' },
  { id:'no_items',  label:'No Items',      restrict:a=>a.isItem===true,    jp:2, desc:'Item use banned' }
];

const JOB_LIST = Object.keys(JOBS);

window.tactics = {
  RACES, JOBS, JOB_LIST, ABILS, ABILITIES, ABILITY_CAT, EQUIP,
  AILMENTS, LAW_POOL, STORY_MISSIONS, DISPATCH, ENCOUNTERS,
  ENEMY_CLANS, CLAN_NAMES, AGENT_UNITS, AGENT_ABILITIES
};
})();
