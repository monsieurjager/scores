/** Noms français des équipes nationales (ESPN les renvoie en anglais). */
const FR: Record<string, string> = {
  Albania: 'Albanie', Algeria: 'Algérie', Argentina: 'Argentine', Armenia: 'Arménie', Australia: 'Australie', Austria: 'Autriche',
  Belgium: 'Belgique', Brazil: 'Brésil', Bulgaria: 'Bulgarie', Canada: 'Canada', Chile: 'Chili', Colombia: 'Colombie', Croatia: 'Croatie',
  Cyprus: 'Chypre', 'Czech Republic': 'Tchéquie', Czechia: 'Tchéquie', Denmark: 'Danemark', England: 'Angleterre', Estonia: 'Estonie',
  Fiji: 'Fidji', Finland: 'Finlande', Georgia: 'Géorgie', Germany: 'Allemagne', Greece: 'Grèce', Hungary: 'Hongrie', Iceland: 'Islande',
  Ireland: 'Irlande', 'Republic of Ireland': 'Irlande', Israel: 'Israël', Italy: 'Italie', 'Ivory Coast': "Côte d'Ivoire", Japan: 'Japon',
  Kosovo: 'Kosovo', Latvia: 'Lettonie', Lithuania: 'Lituanie', Luxembourg: 'Luxembourg', Mexico: 'Mexique', Montenegro: 'Monténégro',
  Morocco: 'Maroc', Netherlands: 'Pays-Bas', 'New Zealand': 'Nouvelle-Zélande', 'North Macedonia': 'Macédoine du Nord', Norway: 'Norvège',
  Poland: 'Pologne', Portugal: 'Portugal', Romania: 'Roumanie', Russia: 'Russie', Samoa: 'Samoa', Scotland: 'Écosse', Senegal: 'Sénégal',
  Serbia: 'Serbie', Slovakia: 'Slovaquie', Slovenia: 'Slovénie', 'South Africa': 'Afrique du Sud', 'South Korea': 'Corée du Sud', Spain: 'Espagne',
  Sweden: 'Suède', Switzerland: 'Suisse', Tonga: 'Tonga', Tunisia: 'Tunisie', Turkey: 'Turquie', 'Türkiye': 'Turquie', Ukraine: 'Ukraine',
  Uruguay: 'Uruguay', 'United States': 'États-Unis', 'United States of America': 'États-Unis', USA: 'États-Unis', Wales: 'Pays de Galles', Namibia: 'Namibie', Egypt: 'Égypte',
  Cameroon: 'Cameroun', Nigeria: 'Nigeria', Ghana: 'Ghana', 'Saudi Arabia': 'Arabie saoudite', Qatar: 'Qatar', Iran: 'Iran', Iraq: 'Irak',
  Paraguay: 'Paraguay', Ecuador: 'Équateur', Peru: 'Pérou', Venezuela: 'Venezuela', Bolivia: 'Bolivie', Honduras: 'Honduras', Panama: 'Panama',
  'Costa Rica': 'Costa Rica', Jamaica: 'Jamaïque', Haiti: 'Haïti', 'Northern Ireland': 'Irlande du Nord', Belarus: 'Biélorussie',
  Azerbaijan: 'Azerbaïdjan', Moldova: 'Moldavie', Malta: 'Malte', Andorra: 'Andorre', Gibraltar: 'Gibraltar', 'San Marino': 'Saint-Marin',
  Liechtenstein: 'Liechtenstein', Kazakhstan: 'Kazakhstan', 'Faroe Islands': 'Îles Féroé', 'Bosnia and Herzegovina': 'Bosnie-Herzégovine',
  'Cape Verde': 'Cap-Vert', 'DR Congo': 'RD Congo', Mali: 'Mali', 'Burkina Faso': 'Burkina Faso', Hong: 'Hong Kong', Uzbekistan: 'Ouzbékistan',
};

export const frenchName = (name: string) => FR[name] ?? name;
