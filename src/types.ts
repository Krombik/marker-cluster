type UnArray<T extends {}[]> = T[keyof T extends string ? keyof T : never];

type AddEmptyFields<T extends {}[], K extends {}> = {
  [i in keyof T]: Omit<K, keyof T[i]> & T[i];
};

type ArrayOfFieldKeys<T extends {}[]> = {
  [i in keyof T]: keyof T[i];
};

type FieldKeysFromArray<T extends string[]> = T[keyof T extends string
  ? keyof T
  : never];

export type XOR<T extends {}[]> = UnArray<
  AddEmptyFields<
    T,
    Partial<Record<FieldKeysFromArray<ArrayOfFieldKeys<T>>, undefined>>
  >
>;
