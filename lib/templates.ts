import type { LayoutPreset } from '@/types/chord';

export interface SongTemplate {
  id: string;
  label: string;
  badge: string;
  description: string;
  defaultPreset: LayoutPreset;
  rawInput: string;
}

export const SONG_TEMPLATES: SongTemplate[] = [
  {
    id: 'amazing-grace-ug',
    label: 'Amazing Grace (Open G Drone)',
    badge: 'UG Two-Line',
    description: 'Acoustic worship ring-out voicings (G*, Cadd9*, Em7*, D/F#*) in Ultimate Guitar two-line format.',
    defaultPreset: 'first_occurrence_only',
    rawInput: `Title: Amazing Grace (My Chains Are Gone)
Artist: Chris Tomlin / Traditional
Key: G
Capo: 3
Tuning: E A D G B E

[ch]G*[/ch]: 320033
[ch]G/B*[/ch]: x20033
[ch]Cadd9*[/ch]: x32033
[ch]D/F#*[/ch]: 200233
[ch]Em7*[/ch]: 022033
[ch]Dsus4*[/ch]: xx0233

[Verse 1]
G*                      G/B*       Cadd9*              G*
Amazing grace, how sweet the sound, that saved a wretch like me
G*                          Em7*        D/F#*              Dsus4*
I once was lost, but now I'm found, was blind, but now I see

[Verse 2]
G*                        G/B*        Cadd9*            G*
'Twas grace that taught my heart to fear, and grace my fears relieved
G*                     Em7*       D/F#*      G*
How precious did that grace appear the hour I first believed

[Chorus]
Cadd9*                G/B*
My chains are gone, I've been set free
Cadd9*                   G*
My God, my Savior has ransomed me
Cadd9*                G/B*
And like a flood His mercy reigns
Em7*           D/F#*         G*
Unending love, amazing grace

[Bridge]
Cadd9*                    G*
The earth shall soon dissolve like snow
D/F#*                     Em7*
The sun forbear to shine
Cadd9*                    G*
But God, who called me here below
D/F#*                     G*
Will be forever mine`,
  },
  {
    id: 'open-e-worship-chordpro',
    label: 'Build My Life (Open-E Drone)',
    badge: 'ChordPro',
    description: 'High-neck E-major drone shapes (Asus2*, Bsus4*, C#m7*, F#m11*) with bracketed ChordPro notation.',
    defaultPreset: 'worship_two_column',
    rawInput: `{title: Build My Life (Open E Shapes)}
{artist: Housefires / Pat Barrett}
{key: E}
{capo: 2}
{tuning: Standard (E A D G B E)}

E* = 022100
Asus2* = x02200
Bsus4* = x24400
C#m7* = x46600
E/G#* = 4x2400
F#m11* = 2x2200

[Intro]
[E*]       [Asus2*]       [E/G#*]       [Asus2*]

[Verse 1]
[E*]Worthy of ev'ry [Asus2*]song we could ever sing
[E/G#*]Worthy of all the [Asus2*]praise we could ever bring
[E*]Worthy of ev'ry [Asus2*]breath we could ever breathe
We live for [E/G#*]You, oh we [Asus2*]live for You

[Verse 2]
[E*]Jesus the name a[Asus2*]bove ev'ry other name
[E/G#*]Jesus the only [Asus2*]one who could ever save
[E*]Worthy of ev'ry [Asus2*]breath we could ever breathe
We live for [E/G#*]You, we [Asus2*]live for You

[Chorus]
[Asus2*]Holy, there is no one [F#m11*]like You
There is none be[E*]side You, open up my [C#m7*]eyes in wonder
[Asus2*]Show me who You are and [F#m11*]fill me
With Your heart and [E*]lead me in Your love to [C#m7*]those around me

[Bridge]
[Asus2*]I will build my [Bsus4*]life upon Your [C#m7*]love
It is a [E/G#*]firm foundation
[Asus2*]I will put my [Bsus4*]trust in You a[C#m7*]lone
And I will [E/G#*]not be shaken`,
  },
  {
    id: 'up-the-neck-study',
    label: 'Jazz & Barre Study (Up-the-Neck)',
    badge: 'ASCII + Barre',
    description: 'Demonstrates 3fr/5fr/7fr offset labels, horizontal barre spans, and ASCII neck glossary blocks.',
    defaultPreset: 'inline_all',
    rawInput: `Title: Autumn Voicing Etude
Artist: FretCast Studio Study
Key: Cm
Capo: 0
Tuning: E A D G B E

Cm7* = x-3-5-3-4-3
Fm9* = x-8-6-8-8-x
G7b9* = 3-x-3-4-3-4
Abmaj7* = 4-x-5-5-4-x

   Dm7b5*  G7alt*
e|---x-------4---|
B|---6-------4---|
G|---5-------4---|
D|---6-------3---|
A|---5-------x---|
E|---x-------3---|

[Section A — Minor Turnaround]
Cm7*                Fm9*
Falling leaves drift past the window pane
Dm7b5*              G7b9*        Cm7*
Autumn voicings ring across the rain

[Section B — Upper Neck Resolution]
Abmaj7*             Dm7b5*       G7alt*
Seventh-fret colors resolve back home to C
Cm7*                Fm9*         G7b9*     Cm7*
Every custom diagram anchored right above the key`,
  },
];
