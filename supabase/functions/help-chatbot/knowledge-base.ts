export type KnowledgeEntry = {
  id: string;
  topic: string;
  questions: string[];
  answer: string;
  source: string;
};

// Papildant žinių bazę užtenka į šį masyvą įdėti naują objektą. Atsakymai turi
// aprašyti tik jau veikiančias svetainės funkcijas ir nurodyti tikrus puslapius.
export const ATMINIMAS_KNOWLEDGE_BASE: KnowledgeEntry[] = [
  {
    id: "create-memorial",
    topic: "Atminimo puslapio sukūrimas",
    questions: [
      "Kaip sukurti atminimo puslapį?",
      "Nuo ko pradėti?",
      "Noriu sukurti artimojo puslapį.",
    ],
    answer:
      "Atidarykite „Parduotuvę“, pasirinkite šiuo metu siūlomą QR lentelę ir spauskite „Kurti atminimo puslapį“. Redaktoriuje įrašykite žmogaus duomenis, sudėkite gyvenimo istoriją bei nuotraukas, pasirinkite dizainą ir puslapio viešumą. Peržiūros žingsnyje patvirtinkite informaciją ir tęskite. Jei dar nesate prisijungę, svetainė išsaugos juodraštį šiame įrenginyje ir paprašys prisijungti prieš sukuriant puslapį bei užsakymą.",
    source: "parduotuve.html; redaktorius.html",
  },
  {
    id: "order-qr",
    topic: "QR lentelės ir QR failo užsakymas",
    questions: [
      "Kaip užsisakyti QR kodą?",
      "Kur užsisakyti QR lentelę?",
      "Ar galiu atsisiųsti QR paveikslėlį?",
    ],
    answer:
      "Fizinės QR atminimo lentelės užsakymas pradedamas „Parduotuvėje“: pasirinkite prieinamą gaminį, sukurkite atminimo puslapį, tada nurodykite pristatymą ir apmokėkite. Savo sukurto puslapio skaitmeninį QR failą galite atsisiųsti kliento zonoje mygtukais „QR PNG“ arba „QR JPG“.",
    source: "parduotuve.html; apmokejimas.html; vartotojas.html",
  },
  {
    id: "qr-operation",
    topic: "Kaip veikia QR kodas",
    questions: [
      "Kaip veikia QR kodas?",
      "Kas atsitinka nuskenavus QR?",
      "Kur nukreipia QR lentelė?",
    ],
    answer:
      "QR kode yra tik to atminimo puslapio interneto adresas. Nuskenavus viešo puslapio QR, puslapis atsidaro iš karto. Jei puslapis apsaugotas, pirmiausia parodomas prieigos kodo langas. Keičiant puslapio turinį ar prieigos kodą QR nesikeičia, nes puslapio adresas lieka tas pats.",
    source: "supabase/functions/profile-manage/index.ts; sablonas-viskas.html",
  },
  {
    id: "edit-page",
    topic: "Atminimo puslapio redagavimas",
    questions: [
      "Kaip redaguoti puslapį?",
      "Kur pakeisti atminimo puslapį?",
      "Noriu pataisyti informaciją.",
    ],
    answer:
      "Prisijunkite ir atidarykite „Kliento zoną“. Prie norimo atminimo puslapio spauskite „Redaguoti“, atlikite pakeitimus redaktoriuje ir pasirinkite „Išsaugoti pakeitimus“. Redaguoti gali puslapio savininkas.",
    source: "vartotojas.html; redaktorius.html",
  },
  {
    id: "edit-photos",
    topic: "Nuotraukų pridėjimas ir keitimas",
    questions: [
      "Kaip pridėti dar vieną nuotrauką?",
      "Kaip pakeisti nuotraukas?",
      "Kiek nuotraukų galima įkelti?",
    ],
    answer:
      "Kliento zonoje prie puslapio spauskite „Redaguoti“. Pirmajame redaktoriaus žingsnyje, skiltyje „Nuotraukos“, galite pasirinkti iki 8 failų ir pakeisti jų tvarką. Redaguojant esamos nuotraukos lieka, kol nepasirenkate naujų; pasirinktas naujas nuotraukų rinkinys pakeičia ankstesnį, todėl iš karto pasirinkite visas nuotraukas, kurias norite palikti. Užrašai ir vaizdo apibūdinimai yra skiltyje „Papildomi nustatymai“.",
    source: "redaktorius.html; assets/redaktorius.js",
  },
  {
    id: "edit-story",
    topic: "Teksto ir biografijos keitimas",
    questions: [
      "Kaip pakeisti tekstą?",
      "Kur redaguoti biografiją?",
      "Kaip pridėti gyvenimo istorijos dalį?",
    ],
    answer:
      "Kliento zonoje pasirinkite „Redaguoti“. Pirmajame žingsnyje atverkite „Gyvenimo istoriją“: galite taisyti esamas teksto dalis, spausti „+ Nauja teksto dalis“ ir pakeisti dalių tvarką. Baigę pereikite į peržiūrą ir išsaugokite pakeitimus.",
    source: "redaktorius.html",
  },
  {
    id: "protect-page",
    topic: "Puslapio apsauga prieigos kodu",
    questions: [
      "Kaip padaryti atminimo puslapį privatų?",
      "Noriu, kad puslapį matytų tik šeima.",
      "Kaip įjungti puslapio apsaugą?",
    ],
    answer:
      "Kuriant puslapį prie klausimo „Ar norite apsaugoti atminimo puslapį prieigos kodu?“ pasirinkite „Taip“ ir susikurkite kodą. Jau sukurtam puslapiui kliento zonoje spauskite „Redaguoti“, skiltyje „Privatumas ir prieiga“ pasirinkite „Taip“, įrašykite kodą du kartus ir išsaugokite. Paskelbtą turinį tada matys tik kodą turintys lankytojai.",
    source: "redaktorius.html; vartotojas.html",
  },
  {
    id: "create-access-code",
    topic: "Prieigos kodo sukūrimas",
    questions: [
      "Kaip susikurti prieigos kodą?",
      "Koks turi būti kodas?",
      "Kodėl mano PIN netinka?",
    ],
    answer:
      "Pasirinkus puslapio apsaugą, įrašykite savo 5–6 skaitmenų prieigos kodą ir pakartokite jį antrame lauke. Labai lengvai atspėjami kodai, pavyzdžiui, vienodi ar iš eilės einantys skaitmenys, nepriimami. Kodas saugomas kaip saugus hash ir jo parodyti vėliau negalima.",
    source: "redaktorius.html; supabase/migrations/20260808114953_memorial_access_codes.sql",
  },
  {
    id: "change-access-code",
    topic: "Prieigos kodo pakeitimas",
    questions: [
      "Kaip pakeisti kodą?",
      "Noriu naujo PIN.",
      "Ar pakeitus kodą reikės naujo QR?",
    ],
    answer:
      "Prisijunkite prie kliento zonos. Prie savo puslapio išskleiskite „Pakeisti prieigos kodą“, patvirtinkite tapatybę paskyros slaptažodžiu ir du kartus įrašykite naują kodą. Išsaugojus senasis kodas nebeveiks. Naujo QR kodo ar naujos lentelės nereikia, nes puslapio adresas nesikeičia.",
    source: "vartotojas.html; assets/user.js",
  },
  {
    id: "forgot-access-code",
    topic: "Pamirštas prieigos kodas",
    questions: [
      "Pamiršau prieigos kodą.",
      "Nebepamenu savo PIN.",
      "Ar galite parodyti seną kodą?",
    ],
    answer:
      "Seno prieigos kodo parodyti negalima. Privačiame puslapyje pasirinkite „Pamiršote prieigos kodą?“, prisijunkite kaip puslapio savininkas, patvirtinkite tapatybę paskyros slaptažodžiu ir susikurkite naują prieigos kodą. Chatbotui nerašykite nei seno, nei naujo kodo.",
    source: "sablonas-viskas.html; vartotojas.html",
  },
  {
    id: "make-public",
    topic: "Apsaugos išjungimas ir viešas puslapis",
    questions: [
      "Kaip padaryti puslapį vėl viešą?",
      "Kaip išjungti prieigos kodą?",
      "Nebenoriu privataus puslapio.",
    ],
    answer:
      "Kliento zonoje prie puslapio spauskite „Redaguoti“. Skiltyje „Privatumas ir prieiga“ pasirinkite „Ne – puslapis bus viešas“ ir išsaugokite pakeitimus. Tas pats QR kodas tuomet puslapį atidarys be prieigos kodo. Jei puslapis dar pažymėtas „Neviešas“, kliento zonoje papildomai spauskite „Paskelbti“.",
    source: "redaktorius.html; vartotojas.html",
  },
  {
    id: "hide-page",
    topic: "Laikinas puslapio paslėpimas",
    questions: [
      "Kaip laikinai paslėpti puslapį?",
      "Nenoriu dabar rodyti puslapio.",
      "Kuo skiriasi privatus ir neviešas puslapis?",
    ],
    answer:
      "Kliento zonoje mygtukas „Paslėpti nuo lankytojų“ padaro puslapį neviešą jo neištrinant; vėliau jį galima vėl paskelbti. Prieigos kodu apsaugotas privatus puslapis yra paskelbtas, bet jo turinį gali atidaryti tik kodą turintys žmonės.",
    source: "vartotojas.html; assets/user.js",
  },
  {
    id: "scan-private-qr",
    topic: "Privataus QR nuskaitymas",
    questions: [
      "Nuskenavau QR ir prašo kodo.",
      "Kodėl QR neatidaro turinio?",
      "Kur gauti privataus puslapio kodą?",
    ],
    answer:
      "Tai reiškia, kad puslapio savininkas įjungė prieigos apsaugą. Įveskite iš savininko gautą kodą. Chatbotas negali kodo parodyti, nustatyti ar apeiti apsaugos. Jei esate puslapio savininkas ir kodą pamiršote, pasirinkite „Pamiršote prieigos kodą?“ ir nustatykite naują kodą po tapatybės patvirtinimo.",
    source: "sablonas-viskas.html",
  },
  {
    id: "order-flow",
    topic: "Užsakymas, pristatymas ir apmokėjimas",
    questions: [
      "Kaip veikia užsakymas?",
      "Kada reikia mokėti?",
      "Kas vyksta sukūrus puslapį?",
    ],
    answer:
      "Parduotuvėje pasirinkite prieinamą QR lentelę ir sukurkite atminimo puslapį. Sukūrus puslapį bei užsakymą pereikite į pristatymo ir apmokėjimo puslapį, pasirinkite vežėją bei paštomatą ir tęskite į saugų mokėjimo puslapį. Po apmokėjimo kliento zonoje patikrinkite puslapį bei QR nuorodą ir patvirtinkite gamybą. Kliento zonoje taip pat matysite užsakymo bei pristatymo būseną.",
    source: "parduotuve.html; apmokejimas.html; vartotojas.html",
  },
  {
    id: "payment-problem",
    topic: "Užsakymo ar mokėjimo nesklandumai",
    questions: [
      "Nepavyko apmokėti.",
      "Kur tęsti užsakymą?",
      "Nerandu savo užsakymo.",
    ],
    answer:
      "Prisijunkite prie kliento zonos ir prie atitinkamo puslapio atidarykite užsakymo tęsinį arba būseną. Jei pristatymo ar mokėjimo puslapis vis tiek neveikia, nebandykite pokalbyje siųsti kortelės duomenų – kreipkitės į „Atminimas“ per rekvizitų ir kontaktų puslapį.",
    source: "vartotojas.html; apmokejimas.html; rekvizitai.html",
  },
  {
    id: "contact-support",
    topic: "Susisiekimas su pagalba",
    questions: [
      "Kaip susisiekti su pagalba?",
      "Noriu parašyti Atminimas komandai.",
      "Kur rasti kontaktus?",
    ],
    answer:
      "Atidarykite svetainės puslapį „Rekvizitai ir kontaktai“. Jame pateikiami oficialūs tuo metu galiojantys „Atminimas“ el. pašto ir telefono duomenys. Jei duomenys dar neįrašyti, chatbotas jų neišgalvos.",
    source: "rekvizitai.html; assets/business-config.js",
  },
  {
    id: "chatbot-boundaries",
    topic: "Chatboto galimybės ir saugumas",
    questions: [
      "Ar chatbotas gali pakeisti mano kodą?",
      "Ar galite ištrinti puslapį?",
      "Ar galiu čia pateikti kortelės duomenis?",
    ],
    answer:
      "Chatbotas tik paaiškina, kaip naudotis svetaine. Jis negali keisti prieigos kodo ar apsaugos, redaguoti savininko duomenų, ištrinti puslapio, keisti užsakymo, atlikti mokėjimo ar suteikti prieigos prie privataus puslapio. Pokalbyje niekada nerašykite prieigos kodo, paskyros slaptažodžio, mokėjimo kortelės ar kitų slaptų duomenų.",
    source: "Chatboto saugumo politika",
  },
];

export function knowledgeBaseForPrompt() {
  return ATMINIMAS_KNOWLEDGE_BASE.map((entry) => [
    `ID: ${entry.id}`,
    `TEMA: ${entry.topic}`,
    `KLAUSIMŲ PAVYZDŽIAI: ${entry.questions.join(" | ")}`,
    `OFICIALUS ATSAKYMAS: ${entry.answer}`,
    `ŠALTINIS PROJEKTE: ${entry.source}`,
  ].join("\n")).join("\n\n---\n\n");
}
