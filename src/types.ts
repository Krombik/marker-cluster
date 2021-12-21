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

type Coords = [lat: number, lng: number];

export type Marker<T> = { marker: T; coords: Coords; key: number };

export type Cluster<T> = {
  items: Point<T>[];
  key: number;
  zoom: number;
  count: number;
  coords: Coords;
};

export type Point<T> = XOR<[Cluster<T>, Marker<T>]>;

export type XAxis<T> = [x: number, p: Point<T>];

export type ClusterMap<T> = Map<number, XAxis<T>>;

export type ClusterObj<T> = { map: ClusterMap<T>; arrY: Float64Array };

export type ClusterStore<T> = Map<number, ClusterObj<T>>;
