export const OPERATOR_PERSON_TYPES: Record<string, string> = { individual: 'Persoană fizică', legal_entity: 'Persoană juridică' };
export const OPERATOR_CONTRACT_TYPES: Record<string, string> = { employment: 'Angajare', services: 'Prestări servicii', freelance: 'Freelancer' };
export type OperatorContract = { person_type: string | null; contract_type: string | null; contract_number: string | null };
