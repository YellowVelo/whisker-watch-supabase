-- Whisker Watch — restore real data after accidental account deletion
--
-- On 2026-07-03 the user hit "Delete Account & All Data" while testing
-- the pet-delete flow, which hard-deletes auth.users and cascades
-- through profiles/pets/pet_foods/medications/vaccinations/symptom_logs
-- (see supabase/functions/delete-account/index.ts). The project has no
-- backups (pitr_enabled: false), so recovery isn't possible via
-- Supabase's backup tooling.
--
-- The data itself was not lost, though: 0003_real_data_import.sql
-- already contains a full snapshot of this data (from the original
-- Base44 -> Supabase migration). This migration is that same data,
-- re-inserted under the user's new account id after they signed up
-- again with the same email.
--
-- Old user_id (deleted): faa3b477-0406-4b8c-9821-c40388c59712
-- New user_id:            fa875b03-2788-47cf-b0a7-75bc86783a21
-- Real pets: Harper, Auggie, Tribble

-- Pets
INSERT INTO public.pets (id, created_by, species, name, photo_url, breed, birth_date, conditions, nicknames, favorite_activities, medications, notes, is_memorial, memorial_date, created_at, updated_at)
VALUES (
  '92f322cc-5204-42f0-b19a-1f435096ccb8', 'fa875b03-2788-47cf-b0a7-75bc86783a21', 'Dog', 'Harper',
  'https://base44.app/api/apps/6a0fa45fbc95773d8eba132b/files/mp/public/6a0fa45fbc95773d8eba132b/f1cbb3eb9_IMG_2758.jpeg', 'Mini Aussie', '2019-04-20',
  '{}', '{}', '{}',
  NULL, NULL, false, NULL,
  '2026-05-29T16:39:00.463000', '2026-05-29T16:39:21.688000'
);
INSERT INTO public.pets (id, created_by, species, name, photo_url, breed, birth_date, conditions, nicknames, favorite_activities, medications, notes, is_memorial, memorial_date, created_at, updated_at)
VALUES (
  '6bd06bf6-d00c-4b6a-8786-cd3fbfcf542d', 'fa875b03-2788-47cf-b0a7-75bc86783a21', 'Dog', 'Auggie',
  'https://base44.app/api/apps/6a0fa45fbc95773d8eba132b/files/mp/public/6a0fa45fbc95773d8eba132b/471da34d1_IMG_5322.jpeg', 'Border Collie', '2014-05-12',
  '{"Allergies","Other"}', '{}', '{}',
  NULL, NULL, false, NULL,
  '2026-05-29T16:38:01.776000', '2026-05-29T16:38:01.776000'
);
INSERT INTO public.pets (id, created_by, species, name, photo_url, breed, birth_date, conditions, nicknames, favorite_activities, medications, notes, is_memorial, memorial_date, created_at, updated_at)
VALUES (
  '67c4d8f8-057e-4169-b540-aa4bdf16ad6b', 'fa875b03-2788-47cf-b0a7-75bc86783a21', 'Cat', 'Tribble',
  'https://base44.app/api/apps/6a0fa45fbc95773d8eba132b/files/mp/public/6a0fa45fbc95773d8eba132b/998f96f03_IMG_1128.jpeg', 'DSH', '2012-04-24',
  '{"IBD","Other","CKD"}', '{}', '{}',
  NULL, 'She has a bad right ankle and knows what time dinner is ', false, NULL,
  '2026-05-22T11:58:21.516000', '2026-06-01T11:46:20.766000'
);

-- Pet foods
INSERT INTO public.pet_foods (created_by, pet_id, name, brand, food_type, prescription, start_date, end_date, active, notes, created_at, updated_at)
VALUES (
  'fa875b03-2788-47cf-b0a7-75bc86783a21', '67c4d8f8-057e-4169-b540-aa4bdf16ad6b', 'Wild Delights Minced Chicken & Turkey', 'Blue Buffalo', 'Wet food',
  false, '2012-05-29', '2025-05-24', true,
  'Blue Buffalo Wilderness Wild Delights Minced Chicken & Turkey in Tasty Gravy Grain-Free Canned Cat Food. She’s been on this since she was an adult.', '2026-05-29T21:09:57.510000', '2026-05-29T21:11:19.205000'
);
INSERT INTO public.pet_foods (created_by, pet_id, name, brand, food_type, prescription, start_date, end_date, active, notes, created_at, updated_at)
VALUES (
  'fa875b03-2788-47cf-b0a7-75bc86783a21', '67c4d8f8-057e-4169-b540-aa4bdf16ad6b', 'Rabbit & Lamb and Lamb ', 'Ziwi Peak', 'Wet food',
  false, '2025-02-25', '2025-05-25', true,
  'Fed her this because it was what Vixen was on ', '2026-05-29T21:07:31.763000', '2026-05-29T21:07:31.763000'
);
INSERT INTO public.pet_foods (created_by, pet_id, name, brand, food_type, prescription, start_date, end_date, active, notes, created_at, updated_at)
VALUES (
  'fa875b03-2788-47cf-b0a7-75bc86783a21', '67c4d8f8-057e-4169-b540-aa4bdf16ad6b', 'BFF Play Pate Lovers Checkmate & Topsy Turvy', 'BFF', 'Wet food',
  false, '2025-05-25', '2025-09-08', true,
  'She was ok w this ', '2026-05-29T21:02:49.716000', '2026-05-29T21:02:49.716000'
);
INSERT INTO public.pet_foods (created_by, pet_id, name, brand, food_type, prescription, start_date, end_date, active, notes, created_at, updated_at)
VALUES (
  'fa875b03-2788-47cf-b0a7-75bc86783a21', '67c4d8f8-057e-4169-b540-aa4bdf16ad6b', 'NF Kidney Function Early Care', 'Purina Pro Plan', 'Wet food',
  true, '2025-09-08', '2025-10-17', true,
  'Purina Pro Plan Veterinary Diets NF Kidney Function Early Care Wet Cat Food, 5.5.  She hated this food ', '2026-05-29T20:57:46.498000', '2026-05-29T20:58:14.223000'
);
INSERT INTO public.pet_foods (created_by, pet_id, name, brand, food_type, prescription, start_date, end_date, active, notes, created_at, updated_at)
VALUES (
  'fa875b03-2788-47cf-b0a7-75bc86783a21', '67c4d8f8-057e-4169-b540-aa4bdf16ad6b', 'Adult Renal Support Early Consult', 'Royal Canin', 'Wet food',
  true, '2025-10-27', '2026-05-17', true,
  'Royal Canin Veterinary Diet Adult Renal Support Early Consult Loaf in Sauce Canned Cat Food, 3-oz, case of 24', '2026-05-29T20:47:40.829000', '2026-05-29T20:47:40.829000'
);
INSERT INTO public.pet_foods (created_by, pet_id, name, brand, food_type, prescription, start_date, end_date, active, notes, created_at, updated_at)
VALUES (
  'fa875b03-2788-47cf-b0a7-75bc86783a21', '67c4d8f8-057e-4169-b540-aa4bdf16ad6b', 'Bllue Buffalo Tastefuls Natural Pate', 'Blue Buffalo', 'Wet food',
  false, '2026-05-14', NULL, true,
  'lue Buffalo Tastefuls Natural Pate Turkey & Chicken Entree Wet Cat Food, 5.5-oz can,', '2026-05-29T20:43:01.792000', '2026-05-29T20:43:01.792000'
);
INSERT INTO public.pet_foods (created_by, pet_id, name, brand, food_type, prescription, start_date, end_date, active, notes, created_at, updated_at)
VALUES (
  'fa875b03-2788-47cf-b0a7-75bc86783a21', '6bd06bf6-d00c-4b6a-8786-cd3fbfcf542d', 'Hill’s Science Diet ZD', 'Hill’s Science Diet', 'Dry food',
  true, '2014-05-29', NULL, true,
  NULL, '2026-05-29T17:43:11.240000', '2026-05-29T17:43:11.240000'
);

-- Medications
INSERT INTO public.medications (created_by, pet_id, name, med_type, prescribed, dosage, frequency, timing_instructions, route, start_date, next_due_date, end_date, prescribing_vet, active, notes, created_at, updated_at)
VALUES (
  'fa875b03-2788-47cf-b0a7-75bc86783a21', '6bd06bf6-d00c-4b6a-8786-cd3fbfcf542d', 'Sentinel Spectrum® Chews for Dogs', 'Heartworm',
  true, '1 chew', 'Monthly', NULL,
  NULL, '2013-06-03', '2013-07-03', NULL,
  'Dr Beyer', true, 'https://shop.frederickroadvet.com/pet/products/1841?item=8870&product=4022',
  '2026-06-05T17:36:56.092000', '2026-06-05T17:36:56.092000'
);
INSERT INTO public.medications (created_by, pet_id, name, med_type, prescribed, dosage, frequency, timing_instructions, route, start_date, next_due_date, end_date, prescribing_vet, active, notes, created_at, updated_at)
VALUES (
  'fa875b03-2788-47cf-b0a7-75bc86783a21', '92f322cc-5204-42f0-b19a-1f435096ccb8', 'Sentinel Spectrum® Chews for Dogs', 'Heartworm',
  true, '1 chew', 'Monthly', NULL,
  'Oral', '2012-06-03', '2012-07-03', NULL,
  'Dr Beyer', true, 'https://shop.frederickroadvet.com/pet/products/1841?item=8870&product=4022
',
  '2026-06-05T17:34:57.660000', '2026-06-05T17:37:37.477000'
);
INSERT INTO public.medications (created_by, pet_id, name, med_type, prescribed, dosage, frequency, timing_instructions, route, start_date, next_due_date, end_date, prescribing_vet, active, notes, created_at, updated_at)
VALUES (
  'fa875b03-2788-47cf-b0a7-75bc86783a21', '92f322cc-5204-42f0-b19a-1f435096ccb8', 'Bravecto Topical Solution for Dogs', 'Flea & Tick',
  true, '500mg / 1 tube', 'Every 3 months', NULL,
  'Transdermal', '2026-05-03', '2026-08-03', '2012-06-03',
  'Dr Beyer', true, NULL,
  '2026-06-05T17:23:04.818000', '2026-06-05T17:37:55.272000'
);
INSERT INTO public.medications (created_by, pet_id, name, med_type, prescribed, dosage, frequency, timing_instructions, route, start_date, next_due_date, end_date, prescribing_vet, active, notes, created_at, updated_at)
VALUES (
  'fa875b03-2788-47cf-b0a7-75bc86783a21', '6bd06bf6-d00c-4b6a-8786-cd3fbfcf542d', 'Bravecto Topical Solution for Dogs', 'Flea & Tick',
  true, '500mg / 1 tube', 'Every 3 months', NULL,
  'Transdermal', '2026-05-03', '2026-08-03', NULL,
  'Dr Beyer', true, NULL,
  '2026-06-05T17:20:19.756000', '2026-06-05T17:20:19.756000'
);
INSERT INTO public.medications (created_by, pet_id, name, med_type, prescribed, dosage, frequency, timing_instructions, route, start_date, next_due_date, end_date, prescribing_vet, active, notes, created_at, updated_at)
VALUES (
  'fa875b03-2788-47cf-b0a7-75bc86783a21', '67c4d8f8-057e-4169-b540-aa4bdf16ad6b', 'Revolution Plus for Cats Green 11.1-22lbs', 'Flea & Tick',
  true, NULL, 'Monthly', 'Once a month during the Catio Months',
  'Transdermal', '2024-06-03', '2024-07-03', NULL,
  'Dr. Beyer', true, NULL,
  '2026-06-05T17:06:34.568000', '2026-06-05T17:17:13.607000'
);
INSERT INTO public.medications (created_by, pet_id, name, med_type, prescribed, dosage, frequency, timing_instructions, route, start_date, next_due_date, end_date, prescribing_vet, active, notes, created_at, updated_at)
VALUES (
  'fa875b03-2788-47cf-b0a7-75bc86783a21', '6bd06bf6-d00c-4b6a-8786-cd3fbfcf542d', 'Gabapentin ', 'General',
  true, '300 / 100mg', 'As needed', 'None',
  'Oral', '2026-05-29', NULL, NULL,
  'Dr Pike & Dr Beyer ', true, '300: for anxiety
100: for pain and lower anxiety ',
  '2026-05-29T17:42:09.928000', '2026-05-29T17:42:09.928000'
);
INSERT INTO public.medications (created_by, pet_id, name, med_type, prescribed, dosage, frequency, timing_instructions, route, start_date, next_due_date, end_date, prescribing_vet, active, notes, created_at, updated_at)
VALUES (
  'fa875b03-2788-47cf-b0a7-75bc86783a21', '6bd06bf6-d00c-4b6a-8786-cd3fbfcf542d', 'Venlafaxine', 'General',
  true, '75mg', 'Twice daily', 'None',
  'Oral', '2026-05-29', NULL, NULL,
  'Dr. Pike', true, 'Give with cheese or peanut butter ',
  '2026-05-29T17:40:34.151000', '2026-05-29T17:40:34.151000'
);
INSERT INTO public.medications (created_by, pet_id, name, med_type, prescribed, dosage, frequency, timing_instructions, route, start_date, next_due_date, end_date, prescribing_vet, active, notes, created_at, updated_at)
VALUES (
  'fa875b03-2788-47cf-b0a7-75bc86783a21', '67c4d8f8-057e-4169-b540-aa4bdf16ad6b', 'Cerenia ', 'General',
  true, NULL, 'As needed', NULL,
  'Oral', '2026-05-22', NULL, NULL,
  'Dr Beyer ', true, NULL,
  '2026-05-22T22:44:53.024000', '2026-05-22T22:44:53.024000'
);
INSERT INTO public.medications (created_by, pet_id, name, med_type, prescribed, dosage, frequency, timing_instructions, route, start_date, next_due_date, end_date, prescribing_vet, active, notes, created_at, updated_at)
VALUES (
  'fa875b03-2788-47cf-b0a7-75bc86783a21', '67c4d8f8-057e-4169-b540-aa4bdf16ad6b', 'Gabapentin', 'General',
  true, '100mg', 'Once daily', 'Sprinkle on food',
  'Oral', '2014-05-22', NULL, NULL,
  'Dr Beyer ', true, NULL,
  '2026-05-22T11:59:33.365000', '2026-05-22T11:59:33.365000'
);

-- Vaccinations
INSERT INTO public.vaccinations (created_by, pet_id, vaccine_name, date_given, next_due_date, administered_by, lot_number, notes, created_at, updated_at)
VALUES (
  'fa875b03-2788-47cf-b0a7-75bc86783a21', '6bd06bf6-d00c-4b6a-8786-cd3fbfcf542d', 'Lyme Vaccine', '2026-02-06', '2027-02-06',
  'Dr. Jessica Beyer', '02161221', NULL,
  '2026-06-01T12:14:38.979000', '2026-06-01T12:14:38.979000'
);
INSERT INTO public.vaccinations (created_by, pet_id, vaccine_name, date_given, next_due_date, administered_by, lot_number, notes, created_at, updated_at)
VALUES (
  'fa875b03-2788-47cf-b0a7-75bc86783a21', '6bd06bf6-d00c-4b6a-8786-cd3fbfcf542d', 'Canine Distemper DA2PP/DHPP Vaccine', '2024-02-09', '2027-02-09',
  'Imported from reminder, invoice, and vaccination', 'Lot information unavailable', NULL,
  '2026-06-01T12:14:38.977000', '2026-06-01T12:14:38.977000'
);
INSERT INTO public.vaccinations (created_by, pet_id, vaccine_name, date_given, next_due_date, administered_by, lot_number, notes, created_at, updated_at)
VALUES (
  'fa875b03-2788-47cf-b0a7-75bc86783a21', '6bd06bf6-d00c-4b6a-8786-cd3fbfcf542d', 'Leptospirosis Vaccine', '2026-02-06', '2027-02-06',
  'Dr. Jessica Beyer', '0217133', NULL,
  '2026-06-01T12:14:38.973000', '2026-06-01T12:14:38.973000'
);
INSERT INTO public.vaccinations (created_by, pet_id, vaccine_name, date_given, next_due_date, administered_by, lot_number, notes, created_at, updated_at)
VALUES (
  'fa875b03-2788-47cf-b0a7-75bc86783a21', '6bd06bf6-d00c-4b6a-8786-cd3fbfcf542d', 'Rabies Vaccine', '2024-02-09', '2027-02-09',
  'Imported from reminder, invoice, and vaccination', 'Lot information unavailable', NULL,
  '2026-06-01T12:14:38.961000', '2026-06-01T12:14:38.961000'
);
INSERT INTO public.vaccinations (created_by, pet_id, vaccine_name, date_given, next_due_date, administered_by, lot_number, notes, created_at, updated_at)
VALUES (
  'fa875b03-2788-47cf-b0a7-75bc86783a21', '6bd06bf6-d00c-4b6a-8786-cd3fbfcf542d', 'Canine Influenza Vaccine', '2025-09-30', '2026-09-30',
  'Ashley E', '89018023', NULL,
  '2026-06-01T12:14:38.957000', '2026-06-01T12:14:38.957000'
);
INSERT INTO public.vaccinations (created_by, pet_id, vaccine_name, date_given, next_due_date, administered_by, lot_number, notes, created_at, updated_at)
VALUES (
  'fa875b03-2788-47cf-b0a7-75bc86783a21', '6bd06bf6-d00c-4b6a-8786-cd3fbfcf542d', 'Bordetella Vaccine', '2026-02-06', '2027-02-06',
  'Dr. Jessica Beyer', '02541183B', NULL,
  '2026-06-01T12:14:38.957000', '2026-06-01T12:14:38.957000'
);
INSERT INTO public.vaccinations (created_by, pet_id, vaccine_name, date_given, next_due_date, administered_by, lot_number, notes, created_at, updated_at)
VALUES (
  'fa875b03-2788-47cf-b0a7-75bc86783a21', '92f322cc-5204-42f0-b19a-1f435096ccb8', 'Rabies Vaccine', '2023-08-14', '2026-08-14',
  'Imported from reminder, invoice, and vaccination', 'N/A', 'Lot information unavailable',
  '2026-06-01T12:14:12.198000', '2026-06-01T12:14:12.198000'
);
INSERT INTO public.vaccinations (created_by, pet_id, vaccine_name, date_given, next_due_date, administered_by, lot_number, notes, created_at, updated_at)
VALUES (
  'fa875b03-2788-47cf-b0a7-75bc86783a21', '92f322cc-5204-42f0-b19a-1f435096ccb8', 'Leptospirosis Vaccine', '2025-08-08', '2026-08-08',
  'Imported from reminder, invoice, and vaccination', 'N/A', 'Lot information unavailable',
  '2026-06-01T12:14:12.038000', '2026-06-01T12:14:12.038000'
);
INSERT INTO public.vaccinations (created_by, pet_id, vaccine_name, date_given, next_due_date, administered_by, lot_number, notes, created_at, updated_at)
VALUES (
  'fa875b03-2788-47cf-b0a7-75bc86783a21', '92f322cc-5204-42f0-b19a-1f435096ccb8', 'Lyme Vaccine', '2025-08-08', '2026-08-08',
  'Imported from reminder, invoice, and vaccination', 'N/A', 'Lot information unavailable',
  '2026-06-01T12:14:12.014000', '2026-06-01T12:14:12.014000'
);
INSERT INTO public.vaccinations (created_by, pet_id, vaccine_name, date_given, next_due_date, administered_by, lot_number, notes, created_at, updated_at)
VALUES (
  'fa875b03-2788-47cf-b0a7-75bc86783a21', '92f322cc-5204-42f0-b19a-1f435096ccb8', 'Canine Distemper DA2PP/ DHPP Vaccine', '2023-08-14', '2026-08-14',
  'Imported from reminder, invoice, and vaccination', 'N/A', 'Lot information unavailable',
  '2026-06-01T12:14:12.012000', '2026-06-01T12:14:12.012000'
);
INSERT INTO public.vaccinations (created_by, pet_id, vaccine_name, date_given, next_due_date, administered_by, lot_number, notes, created_at, updated_at)
VALUES (
  'fa875b03-2788-47cf-b0a7-75bc86783a21', '92f322cc-5204-42f0-b19a-1f435096ccb8', 'Canine Influenza Vaccine', '2025-08-08', '2026-08-08',
  'Imported from reminder, invoice, and vaccination', 'N/A', 'Lot information unavailable',
  '2026-06-01T12:14:12.011000', '2026-06-01T12:14:12.011000'
);
INSERT INTO public.vaccinations (created_by, pet_id, vaccine_name, date_given, next_due_date, administered_by, lot_number, notes, created_at, updated_at)
VALUES (
  'fa875b03-2788-47cf-b0a7-75bc86783a21', '92f322cc-5204-42f0-b19a-1f435096ccb8', 'Bordetella Vaccine', '2025-08-08', '2026-08-08',
  'Imported from reminder, invoice, and vaccination', 'N/A', 'Lot information unavailable',
  '2026-06-01T12:11:11.660000', '2026-06-01T12:14:12.010000'
);
INSERT INTO public.vaccinations (created_by, pet_id, vaccine_name, date_given, next_due_date, administered_by, lot_number, notes, created_at, updated_at)
VALUES (
  'fa875b03-2788-47cf-b0a7-75bc86783a21', '67c4d8f8-057e-4169-b540-aa4bdf16ad6b', 'Rabies', '2025-09-04', '2028-09-04',
  'Dr Beyer', NULL, NULL,
  '2026-06-01T11:56:26.991000', '2026-06-01T11:56:26.991000'
);

-- Symptom logs
INSERT INTO public.symptom_logs (created_by, pet_id, date, appetite, vomiting, stool_quality, energy_level, water_intake, weight_grams, urination, nausea_symptoms, pain_signs, medication_given, notes, created_at)
VALUES (
  'fa875b03-2788-47cf-b0a7-75bc86783a21', '67c4d8f8-057e-4169-b540-aa4bdf16ad6b', '2026-06-13', 'Ate some', 0,
  NULL, NULL, NULL, NULL,
  NULL, '{}', false, false,
  NULL, '2026-06-15T23:25:11.869000'
);
INSERT INTO public.symptom_logs (created_by, pet_id, date, appetite, vomiting, stool_quality, energy_level, water_intake, weight_grams, urination, nausea_symptoms, pain_signs, medication_given, notes, created_at)
VALUES (
  'fa875b03-2788-47cf-b0a7-75bc86783a21', '67c4d8f8-057e-4169-b540-aa4bdf16ad6b', '2026-06-15', 'Ate all', 0,
  NULL, NULL, NULL, NULL,
  NULL, '{"Burping"}', false, false,
  NULL, '2026-06-15T23:24:54.341000'
);
INSERT INTO public.symptom_logs (created_by, pet_id, date, appetite, vomiting, stool_quality, energy_level, water_intake, weight_grams, urination, nausea_symptoms, pain_signs, medication_given, notes, created_at)
VALUES (
  'fa875b03-2788-47cf-b0a7-75bc86783a21', '6bd06bf6-d00c-4b6a-8786-cd3fbfcf542d', '2026-05-20', 'Ate all', 0,
  NULL, 'Calm', NULL, NULL,
  NULL, '{"Drooling"}', false, false,
  'Heavy panting and lots of drooling ', '2026-06-11T11:30:01.994000'
);
INSERT INTO public.symptom_logs (created_by, pet_id, date, appetite, vomiting, stool_quality, energy_level, water_intake, weight_grams, urination, nausea_symptoms, pain_signs, medication_given, notes, created_at)
VALUES (
  'fa875b03-2788-47cf-b0a7-75bc86783a21', '67c4d8f8-057e-4169-b540-aa4bdf16ad6b', '2026-06-09', 'Ate most', 0,
  'Normal', 'Normal', 'Normal', NULL,
  'Normal', '{"Burping"}', false, false,
  NULL, '2026-06-09T22:11:03.862000'
);
INSERT INTO public.symptom_logs (created_by, pet_id, date, appetite, vomiting, stool_quality, energy_level, water_intake, weight_grams, urination, nausea_symptoms, pain_signs, medication_given, notes, created_at)
VALUES (
  'fa875b03-2788-47cf-b0a7-75bc86783a21', '67c4d8f8-057e-4169-b540-aa4bdf16ad6b', '2026-05-30', 'Ate all', 0,
  'Soft', 'Normal', 'Normal', NULL,
  'Reduced', '{}', false, true,
  'Think she is getting used to the new food', '2026-06-01T11:44:17.697000'
);
INSERT INTO public.symptom_logs (created_by, pet_id, date, appetite, vomiting, stool_quality, energy_level, water_intake, weight_grams, urination, nausea_symptoms, pain_signs, medication_given, notes, created_at)
VALUES (
  'fa875b03-2788-47cf-b0a7-75bc86783a21', '67c4d8f8-057e-4169-b540-aa4bdf16ad6b', '2026-05-31', 'Ate all', 0,
  'Normal', 'Normal', 'Normal', NULL,
  'Normal', '{}', false, true,
  NULL, '2026-06-01T11:43:28.745000'
);
INSERT INTO public.symptom_logs (created_by, pet_id, date, appetite, vomiting, stool_quality, energy_level, water_intake, weight_grams, urination, nausea_symptoms, pain_signs, medication_given, notes, created_at)
VALUES (
  'fa875b03-2788-47cf-b0a7-75bc86783a21', '67c4d8f8-057e-4169-b540-aa4bdf16ad6b', '2026-05-30', 'Ate all', 1,
  'Normal', 'Normal', 'Normal', NULL,
  'None', '{}', false, true,
  NULL, '2026-05-30T18:49:53.781000'
);
INSERT INTO public.symptom_logs (created_by, pet_id, date, appetite, vomiting, stool_quality, energy_level, water_intake, weight_grams, urination, nausea_symptoms, pain_signs, medication_given, notes, created_at)
VALUES (
  'fa875b03-2788-47cf-b0a7-75bc86783a21', '67c4d8f8-057e-4169-b540-aa4bdf16ad6b', '2026-05-27', 'Ate most', 1,
  NULL, 'Normal', NULL, NULL,
  NULL, '{}', false, false,
  'Was dried - probably overnight ', '2026-05-29T20:37:47.396000'
);
INSERT INTO public.symptom_logs (created_by, pet_id, date, appetite, vomiting, stool_quality, energy_level, water_intake, weight_grams, urination, nausea_symptoms, pain_signs, medication_given, notes, created_at)
VALUES (
  'fa875b03-2788-47cf-b0a7-75bc86783a21', '6bd06bf6-d00c-4b6a-8786-cd3fbfcf542d', '2026-05-29', NULL, 0,
  NULL, NULL, NULL, 15966,
  NULL, '{"Drooling"}', false, false,
  NULL, '2026-05-29T17:43:41.885000'
);
INSERT INTO public.symptom_logs (created_by, pet_id, date, appetite, vomiting, stool_quality, energy_level, water_intake, weight_grams, urination, nausea_symptoms, pain_signs, medication_given, notes, created_at)
VALUES (
  'fa875b03-2788-47cf-b0a7-75bc86783a21', '67c4d8f8-057e-4169-b540-aa4bdf16ad6b', '2026-05-22', 'Refused', 1,
  'Normal', 'Normal', 'Not observed', NULL,
  NULL, '{"Lip licking"}', false, false,
  'Gave Cerenia ', '2026-05-22T22:44:22.067000'
);
INSERT INTO public.symptom_logs (created_by, pet_id, date, appetite, vomiting, stool_quality, energy_level, water_intake, weight_grams, urination, nausea_symptoms, pain_signs, medication_given, notes, created_at)
VALUES (
  'fa875b03-2788-47cf-b0a7-75bc86783a21', '67c4d8f8-057e-4169-b540-aa4bdf16ad6b', '2026-05-21', 'Ate very little', 1,
  'Soft', 'Normal', 'Normal', NULL,
  'None', '{}', false, true,
  NULL, '2026-05-22T12:08:48.997000'
);
