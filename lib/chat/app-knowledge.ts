// Compact, user-facing knowledge about how Menu Planner works, so the chat
// assistant can answer "hoe werkt de app?" without reading source files.
// Plain Dutch, written for a non-technical user, using the words that appear in
// the app. Keep every text short and true to the code; update it together with
// the app when screens or behaviour change.

export const APP_KNOWLEDGE: { topic: string; title: string; text: string }[] = [
  {
    topic: "overzicht",
    title: "Wat is Menu Planner?",
    text: `Menu Planner is de privé-app van Robin en Amber. Je plant maaltijden per dag, bewaart recepten, houdt de diepvries bij en maakt een boodschappenlijstje.
Er zijn vier pagina’s: Planning, Boodschappen, Recepten en Diepvries.
Het werkt zo: je kiest recepten voor de dagen in Planning. Daarna kies je de dagen waarvoor je boodschappen wilt en klik je op “Boodschappen bijwerken”. De ingrediënten komen dan op het boodschappenlijstje.
Extra porties kan je invriezen als potjes. Die kan je later weer inplannen, zodat je niets hoeft te koken of te kopen.`,
  },
  {
    topic: "navigatie",
    title: "Waar vind ik wat? (menu)",
    text: `Op een computer staat links een menu met vier items: Planning (kalender), Boodschappen (winkelwagen), Recepten (boek) en Diepvries (sneeuwvlok). Met de knop bovenaan kan je het menu smaller maken.
Op een telefoon staat dezelfde keuze als balk onderaan het scherm.
Onderaan het menu (op de telefoon bovenaan rechts) vind je je account en de knop om tussen licht en donker te wisselen.
De app opent altijd op Planning.
Op Diepvries zijn er drie tabbladen: Potjes, Vleesjes en Groenten.`,
  },
  {
    topic: "planning",
    title: "De planning begrijpen",
    text: `Planning toont een kaart per dag, vanaf vandaag tot minstens 10 dagen verder, bv. “Vrijdag 05/06”. Onderaan voeg je met “Voeg dagen toe” telkens 7 dagen toe.
Elke dagkaart heeft: twee situatie-bolletjes (Amber en Robin), een knop “Notitie”, de vakken voor de maaltijden en rechtsboven een vinkje om de dag voor de boodschappen te kiezen.
Een gele kaart is een gerecht uit je recepten. Een blauwe kaart is een potje uit de diepvries.
Klik op een kaart voor details: wie eet mee, ingrediënten in de juiste hoeveelheid, bereiding en notities.
Bovenaan staan de knoppen “Potjesverloop” en “Boodschappen bijwerken”.`,
  },
  {
    topic: "maaltijd-toevoegen",
    title: "Een maaltijd inplannen, verplaatsen of verwijderen",
    text: `Inplannen:
1. Klik bij een dag op de stippellijn-knop met een plus, bv. “+ Samen”, “+ Amber” of “+ Robin”.
2. Kies “Gerecht” voor een recept, of “Potje diepvries” voor een ingevroren potje.
3. Bij “Gerecht” kom je in Recepten. Bovenaan staat “Kies een gerecht voor …”. Klik op een recept: het staat nu op de dag. Met “Terug” stop je.
Verplaatsen: pak het greepje links op de kaart vast en sleep naar een andere dag of een ander vak.
Verwijderen: klik op het prullenbakje op de kaart.
Staat er al een Samen-maaltijd op de dag, dan zie je de vakken van Amber en Robin pas als je een maaltijd sleept.`,
  },
  {
    topic: "wie-eet-mee",
    title: "Wie eet mee: Samen, Amber of Robin",
    text: `Elke dag heeft drie vakken: Samen (breed vak, Robin en Amber samen) en daaronder Amber en Robin apart.
Het vak bepaalt hoeveel personen mee-eten. Samen is twee personen, Amber of Robin is één persoon. De ingrediënten op de kaart en op het boodschappenlijstje rekenen daarmee.
Op de kaart zie je bolletjes met de namen van wie meeëet.
Sleep je een maaltijd naar een ander vak, dan verandert wie meeëet en worden de hoeveelheden opnieuw berekend.
Bij een potje uit de diepvries heeft elke persoon zijn eigen potje nodig: Samen gebruikt een potje van Robin én een van Amber.`,
  },
  {
    topic: "situaties",
    title: "Situaties (24 uur, Thuiswerk, …)",
    text: `Bij elke dag staan twee bolletjes, bv. “Amber: thuis” en “Robin: thuis”. Dat is de situatie van die persoon die dag.
Klik op het bolletje om te kiezen. Eerst staat “Thuis”, daaronder de situaties van die persoon. Welke er zijn, hangt af van wat jullie zelf aanmaakten.
Eigen situatie maken: kies “Nieuw”, typ een naam en klik “Toevoegen”. Ze wordt meteen op die dag gezet.
Het tandwiel naast een situatie laat je hernoemen of verwijderen. Bij verwijderen gaan de dagen terug naar Thuis.
Een situatie is alleen een herinnering. Ze verandert niets aan recepten, boodschappen of diepvries.`,
  },
  {
    topic: "dagnotitie",
    title: "Een notitie bij een dag",
    text: `Elke dagkaart heeft een knop “Notitie” (met een geel briefje). Klik erop en typ vrije tekst, bv. “Gebruik worsten uit de diepvries”.
De notitie wordt bewaard zodra je buiten het veld klikt. Met Escape verlaat je het veld.
Wissen doe je met het kruisje naast de notitie.
Een notitie is alleen tekst voor jezelf. Ze verandert niets aan de planning of de boodschappen.`,
  },
  {
    topic: "potjes-invriezen",
    title: "Extra potjes koken en invriezen",
    text: `Een potje is één ingevroren portie voor één persoon.
Extra potjes maken:
1. Plan een gerecht (gele kaart).
2. Klik op het bolletje “potje” met de sneeuwvlok.
3. In “Extra porties invriezen” zet je met min en plus per persoon het aantal (tot 20).
Het bolletje toont dan bv. “+2 potjes”.
De ingrediënten worden groter met de extra porties, ook op het boodschappenlijstje.
Ze tellen mee vanaf de kookdag en je kan ze vanaf de dag erna inplannen.
Verlagen kan niet onder het aantal potjes dat al op een andere dag is ingepland.`,
  },
  {
    topic: "potjes-opeten",
    title: "Een potje uit de diepvries opeten (blauwe kaart)",
    text: `Een blauwe kaart met een sneeuwvlok is een potje uit de diepvries. Er hoeft niets voor gekocht te worden.
Inplannen:
1. Klik bij een dag op “+ Samen”, “+ Amber” of “+ Robin”.
2. Kies “Potje diepvries”.
3. Kies een gerecht.
Onder “In de diepvries” staan potjes die er al zijn, met het aantal. Onder “Wordt nog gemaakt” staan potjes die een eerdere maaltijd nog kookt (“klaar vanaf …”).
Doorgestreepte potjes kan je niet kiezen: “Al ingepland”, “pas klaar vanaf …” of “geen portie”.
De app reserveert het oudste potje. Het verdwijnt uit de diepvries zodra de dag voorbij is.`,
  },
  {
    topic: "vleesjes",
    title: "Vleesje kiezen bij een gerecht",
    text: `Sommige recepten hebben een vleesje: het vlees kies je pas bij het plannen. Zo’n recept heeft “[vleesje]” in de naam of de schakelaar “Vleesje-template” aan.
Op de gele kaart staat dan een roze bolletje “kies vleesje”.
1. Klik erop. Het venster “Kies vleesje” opent.
2. Kies onder “Uit de diepvries” een vleesje; het getal is hoeveel er nog vrij is.
3. Of typ onder “Te kopen” bv. “4 worsten” en druk Enter.
4. Klik “Bewaren”.
Het bolletje toont nu bv. “2 hamburger + 1 worst”. Wat je moet kopen staat meteen op je boodschappenlijstje onder “Uit je planning”.`,
  },
  {
    topic: "groenten-diepvries",
    title: "Groenten uit de diepvries gebruiken",
    text: `Bij een gerecht kan je groenten uit de diepvries nemen.
1. Klik op het bolletje “groente” (wortel) op de gele kaart.
2. Kies in “Groenten uit de diepvries” een groente. Elke klik voegt 100 gram, een halve kilogram of 1 stuk toe, naargelang de eenheid. Met min en plus pas je aan.
3. Kies bij “Niet kopen:” welk ingrediënt van het recept daardoor niet meer op het boodschappenlijstje moet. De app doet zelf een voorstel.
4. Klik “Bewaren”.
Bij een potje uit de diepvries (blauwe kaart) is er geen groente-keuze.`,
  },
  {
    topic: "reservaties-en-tekorten",
    title: "Reserveren en tekorten in de diepvries",
    text: `Kies je vleesjes of groenten uit de diepvries voor een maaltijd, dan worden ze gereserveerd, de oudste voorraad eerst. Je kan niet meer kiezen dan er vrij is: “Er is nog maar 1 … vrij in de diepvries.”
De voorraad daalt pas nadat de dag van de maaltijd voorbij is. Dat wordt bijgewerkt als je Planning of Diepvries opent.
Op de tabs Vleesjes en Groenten zie je groene bolletjes zoals “2 ingepland op vr 5 nov” en “3 vrij”.
Verlaag je de voorraad zelf, dan geven de laatste maaltijden hun deel terug: rood bolletje “tekort” op de kaart.
Voeg je voorraad toe of verwijder je een maaltijd, dan worden tekorten automatisch aangevuld, vroegste dag eerst.`,
  },
  {
    topic: "diepvries-grafiek",
    title: "De grafiek Potjesverloop",
    text: `Op Planning toont de knop “Potjesverloop” of verbergt een grafiek. De app onthoudt je keuze in die browser.
De grafiek volgt hoeveel potjes Robin (blauwe lijn) en Amber (oranje lijn) in de diepvries hebben, aan het einde van elke dag. Onder de grafiek staat per persoon “start → einde” met het verschil, bv. “4 → 6 (+2)”.
De lijn stijgt op de kookdag van extra potjes en daalt op de dag dat een potje wordt opgegeten.
Klik of ga met de muis op een dag voor het aantal per persoon en wat er veranderde, bv. “+2 Naam (Robin, gemaakt)”.
Met het kruisje sluit je de grafiek. Alleen potjes tellen mee, geen vleesjes of groenten.`,
  },
  {
    topic: "potjes-beheren",
    title: "Tab Potjes: wat ligt er in de diepvries",
    text: `Op Diepvries toont het tabblad Potjes alle gerechten met per persoon het aantal in de diepvries. Bovenaan filter je met de knoppen Robin, Amber of Samen (gerechten die er voor beiden zijn). Klik nog eens om de filter weg te halen.
Handmatig invriezen: klik “Nieuw potje”, typ de naam, vul het aantal per persoon in en klik “Potje toevoegen”.
Aantal corrigeren: klik op een aantal, dan min of plus. Een ingepland potje kan je niet wegnemen.
Verwijderen: prullenbak, dan “Verwijderen”. Ingeplande of nog te koken potjes blijven staan.
Bolletjes tonen “Wordt gemaakt …” (amber) en “Ingepland …” (groen).`,
  },
  {
    topic: "vleesjes-en-groenten-beheren",
    title: "Tabs Vleesjes en Groenten beheren",
    text: `Vleesjes en groenten voeg je toe op Diepvries, telkens als je iets invriest.
Vleesjes: klik “Nieuw vleesje”, vul naam en aantal in, klik “Vleesje toevoegen”. Per partij staat de datum en een teller met min en plus. Staat de teller op 0, dan verdwijnt de partij uit de lijst.
Groenten: klik “Nieuwe groente”, vul naam, hoeveelheid en eenheid in (gram, kilogram, stuk, portie, zak, doos of verpakking). Met het potlood pas je aan, met de prullenbak verwijder je.
Eerder gebruikte namen worden voorgesteld terwijl je typt.
Wijzig je de naam of eenheid van een groente, dan kiezen geplande maaltijden opnieuw.`,
  },
  {
    topic: "recepten",
    title: "De pagina Recepten",
    text: `Recepten is de receptendatabank, met een kaart per recept (foto, naam, tags).
Zoeken: typ in “Zoeken...”. Elk woord moet voorkomen in de naam, de tags of de ingrediënten.
Filteren: klik op tags onder het zoekveld. Een recept moet alle gekozen tags hebben. “wissen” haalt alles weg.
Klik op een kaart om het recept te bekijken of aan te passen. Het menu “Meer acties” heeft Bewerken en Verwijderen.
Verwijderen is definitief. Eerder ingeplande maaltijden blijven op de planning staan, maar zonder ingrediënten en dus ook niet op het boodschappenlijstje.
Knoppen bovenaan: “Tags” en “Nieuw recept”.`,
  },
  {
    topic: "recept-toevoegen",
    title: "Een recept toevoegen of aanpassen",
    text: `1. Klik op Recepten op “Nieuw recept”.
2. Vul de Naam in.
3. Foto (niet verplicht): “Kies foto” (jpg, png, webp of gif, tot 5 MB) of plak een “Afbeeldingslink”.
4. Kies tags of maak er een nieuwe bij.
5. Zet “Vleesje-template” aan als het vlees pas bij het plannen gekozen wordt.
6. Klik “Voeg ingrediënt toe” en vul per ingrediënt naam, hoeveelheid en eenheid in. De schakelaar “Boodschappenlijst” bepaalt of het ingrediënt op het lijstje komt.
7. Vul eventueel “Recept” (stappen) en “Notities” in.
8. Klik “Maken”. Bij aanpassen heet de knop “Pas recept aan”.`,
  },
  {
    topic: "recept-hoeveelheden",
    title: "Hoeveelheden in een recept",
    text: `Bij elk ingrediënt zie je de vakjes Samen, Amber en Robin.
Samen: de hoeveelheid voor jullie twee samen. De app rekent dit om naar één portie. Eet er één persoon mee, dan is het de helft. Elke extra potje telt als een portie bij.
Amber en/of Robin ingevuld: elke persoon heeft een eigen hoeveelheid. Wie meeëet telt mee en elk extra potje gebruikt de hoeveelheid van de persoon voor wie het is.
Gebruik dat voor dingen die per persoon verschillen.
De eenheden: stuk, teen, gram, dl, cl, ml, koffielepel en theelepel.
Pas je een recept aan, dan veranderen ook de ingrediënten van maaltijden die al zijn ingepland.`,
  },
  {
    topic: "tags",
    title: "Tags voor recepten",
    text: `Met tags label je recepten en filter je ze op de pagina Recepten. Welke tags er zijn, hangt af van wat jullie zelf aanmaakten.
Tag aan een recept hangen: open het recept, klik op een tag. Of typ onder “Nieuwe tag…” een naam en klik “Tag”: die wordt meteen aangemaakt.
Beheren: klik op Recepten op “Tags”. In “Tags beheren” maak je tags aan, hernoem je ze (recepten houden hun tag) of verwijder je ze (ze verdwijnen ook van alle recepten).
Een tag die al bestaat geeft “Die tag bestaat al.”
Een tag doet verder niets, ze dient om te zoeken.`,
  },
  {
    topic: "boodschappenlijst",
    title: "Het boodschappenlijstje",
    text: `De pagina Boodschappen heeft twee delen:
“Zelf toegevoegd”: je eigen lijstje. Het blijft altijd staan, ook als je boodschappen uit je planning bijwerkt.
“Uit je planning”: wordt gemaakt uit je planning en vervangen bij “Boodschappen bijwerken”.
Je typt gewoon in beide delen, als in een notitie-app. Met de knoppen bovenaan (Titel, Subtitel, Vet, Lijst, Genummerd, Vinkjes) maak je kopjes en lijsten. Vinkjes zet je aan als je iets in je mandje hebt.
Alles wordt automatisch bewaard (“opslaan…” en dan “bewaard”).
De knop “Categorieën” beheert de winkelsecties.`,
  },
  {
    topic: "boodschappen-bijwerken",
    title: "Hoe komt iets op de boodschappenlijst?",
    text: `1. Vink op Planning de dagen aan waarvoor je boodschappen wilt.
2. Klik “Boodschappen bijwerken (aantal)”. Zonder dag is de knop grijs: “Selecteer minstens 1 dag”.
3. Bevestig met “Bijwerken”. Je komt op het boodschappenlijstje.
De ingrediënten van die dagen worden opgeteld en per sectie gezet in “Uit je planning”. Dat deel wordt helemaal vervangen, ook je vinkjes daar. “Zelf toegevoegd” blijft ongemoeid.
Niet op de lijst: potjes uit de diepvries, ingrediënten waar “Boodschappenlijst” uitstaat, en ingrediënten die je vervangt door groenten uit de diepvries.
Vleesjes bij “Te kopen” staan er al meteen na “Bewaren”.`,
  },
  {
    topic: "boodschappen-categorieen",
    title: "Secties op het boodschappenlijstje",
    text: `Het lijstje “Uit je planning” is verdeeld in winkelsecties, zoals Groenten & Fruit, Vlees & Vis, Zuivel & Eieren, Brood & Bakkerij, Droge voeding, Diepvries, Kruiden & Sauzen, Dranken en Overig.
Bij nieuwe ingrediënten kiest een AI de sectie. Is die niet bereikbaar of twijfelt ze, dan komt het in Overig.
Aanpassen: klik op “Categorieën”.
Onder “Secties” maak je secties aan, hernoem je ze of verwijder je ze. Een verwijderde sectie stuurt haar ingrediënten naar Overig.
Onder “Ingrediënten” kies je zelf de sectie van een ingrediënt. Die keuze blijft altijd gelden.
“Herbereken” laat de AI de zelf niet gekozen ingrediënten opnieuw indelen.
Het lijstje zelf verandert pas bij de volgende “Boodschappen bijwerken”.`,
  },
  {
    topic: "boodschappen-herkomst",
    title: "Waar komt deze regel vandaan? (het i-bolletje)",
    text: `In “Uit je planning” staat achter veel regels een klein i-bolletje (ⓘ), “Waar komt dit vandaan?”.
Ga erover met de muis, of tik erop op een telefoon. Een tik houdt het venstertje open. Escape of ergens anders klikken sluit het.
Je ziet het totaal van de regel, “Komt van 3 maaltijden” en per maaltijd: hoeveel, welk gerecht, voor wie (Amber of Robin als het niet Samen is) en op welke dag.
Zo zie je bv. waarom er 600 gram gehakt op staat.
Pas je de regel zelf aan, dan zoekt de app nog op de naam van het ingrediënt.
Het bolletje bestaat alleen in “Uit je planning”.`,
  },
  {
    topic: "geschiedenis",
    title: "Wat gebeurt er met voorbije dagen?",
    text: `Planning toont alleen vandaag en later. Een scherm voor eerdere dagen is er niet.
De gegevens van voorbije dagen blijven wel bewaard (maaltijden, notities, situaties). De assistent kan ze opzoeken.
Potjes die je voor vandaag hebt opgegeten, verdwijnen uit de lijsten en de grafiek. Vleesjes en groenten worden afgeboekt nadat de dag van de maaltijd voorbij is.
Het boodschappenlijstje bewaart geen oude versies: “Boodschappen bijwerken” vervangt “Uit je planning”.
Verwijder je een recept, dan is het weg. Ingeplande maaltijden ervan blijven met alleen hun naam staan.
Eerder getypte namen van potjes, vleesjes en groenten blijven als suggestie beschikbaar.`,
  },
  {
    topic: "chat",
    title: "Wat kan de assistent (chat)?",
    text: `De assistent beantwoordt vragen in gewone taal.
Hij kan alles bekijken: recepten (zoeken op naam, tag of ingrediënt, en één recept volledig), de planning van elke periode, ook vroeger (wat aten we wanneer, hoe vaak), de diepvries met reserveringen en tekorten, het boodschappenlijstje met de herkomst van elke regel, en de tags en situaties.
Hij kan ook gegevens aanpassen: situaties, dagnotities, maaltijden plannen of verplaatsen, vleesjes en groenten bij een maaltijd, recepten, tags, situaties en winkelsecties beheren, de diepvries bijwerken en het boodschappenlijstje aanvullen of afvinken. Hij toont dan eerst een kaart met wat er verandert; pas als je op goedkeuren tikt gebeurt het. Daarna kan je het met “Ongedaan maken” terugdraaien, zolang niemand dezelfde gegevens intussen nog aanpaste. Verwijderen doet hij alleen als je er uitdrukkelijk om vraagt.
Hij kan ook een wijziging aan de app zelf laten bouwen (uiterlijk, knoppen, teksten, gedrag). Hij start het meteen, zonder te vragen; met “Ongedaan maken” op het kaartje zet je het terug.
Je ziet de voortgang: in wachtrij, bezig, gecontroleerd, gepubliceerd, live. Een veiligheidscontrole kan blokkeren.
Er loopt maar één wijziging tegelijk, en er zijn er maximaal 10 per dag. Een live wijziging kan je ongedaan laten maken.`,
  },
];
