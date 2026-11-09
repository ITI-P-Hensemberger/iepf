// Names are letters, optionally joined by an apostrophe (D'Angelo, Dell'Orto). Phone keyboards
// type the curly ’ instead of ', so both are accepted.
export const PERSON_NAME_PATTERN = /^\p{L}+(?:['’]\p{L}+)*$/u
