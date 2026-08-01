// Curated common-breed lists for client-side autocomplete only (spec 0029
// FR-009). Not exhaustive and not a canonical lookup table — pets.breed
// stays free text, so any value typed here is just a suggestion; users can
// still type a custom breed or "Mixed" and it saves as entered.
export const CAT_BREEDS = [
  'Domestic Shorthair', 'Domestic Longhair', 'Mixed Breed', 'Siamese', 'Maine Coon',
  'Persian', 'Ragdoll', 'British Shorthair', 'Sphynx', 'Abyssinian', 'Bengal',
  'Russian Blue', 'Scottish Fold', 'American Shorthair', 'Devon Rex', 'Cornish Rex',
  'Birman', 'Burmese', 'Himalayan', 'Norwegian Forest Cat', 'Oriental Shorthair',
  'Tonkinese', 'Turkish Angora', 'Manx', 'Exotic Shorthair', 'Egyptian Mau',
  'Somali', 'Balinese', 'Chartreux', 'Savannah',
];

export const DOG_BREEDS = [
  'Mixed Breed', 'Labrador Retriever', 'Golden Retriever', 'German Shepherd',
  'French Bulldog', 'Bulldog', 'Poodle', 'Beagle', 'Rottweiler', 'Dachshund',
  'German Shorthaired Pointer', 'Yorkshire Terrier', 'Boxer', 'Great Dane',
  'Siberian Husky', 'Cavalier King Charles Spaniel', 'Doberman Pinscher',
  'Australian Shepherd', 'Miniature Schnauzer', 'Shih Tzu', 'Boston Terrier',
  'Bernese Mountain Dog', 'Pomeranian', 'Havanese', 'Cane Corso',
  'Chihuahua', 'Shetland Sheepdog', 'Pug', 'Border Collie', 'Basset Hound',
  'Mini Aussie', 'Corgi', 'Maltese', 'Cocker Spaniel', 'Vizsla',
];

export const getBreeds = (species) => species === 'Dog' ? DOG_BREEDS : CAT_BREEDS;
