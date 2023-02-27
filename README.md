# MarkerCluster

MarkerCluster is a lightweight, dependency-free library for clustering markers. This package provides both synchronous and asynchronous clustering of markers based on the zoom level and the viewport's geographic bounds.

#### Why should I use MarkerCluster?

- [it is really fast](#benchmark)
- it could leverage [Worker](https://developer.mozilla.org/en-US/docs/Web/API/Worker/Worker) to avoid freezing while clustering a large amount of points (browsers only)
- it does not dictate supplied points format
- format of returned points is customizable
- flexible for use with various map libraries

## Example

```ts
import MarkerCluster from "marker-cluster";

type Point = { lat: number; lng: number };

const points: Point[] = [
  { lat: -31.56391, lng: 147.154312 },
  { lat: -33.718234, lng: 150.363181 },
  { lat: -33.727111, lng: 150.371124 },
  { lat: -33.848588, lng: 151.209834 },
];

const markerCluster = new MarkerCluster<Point>((v) => [v.lng, v.lat], {
  radius: 75,
});

markerCluster.load(points);

// or

await markerCluster.loadAsync(points);

const currPoints = markerCluster
  .setZoom(2)
  .setBounds(-180, -85, 180, 85)
  .getPoints(
    (point, uniqueKey) => ({ point, uniqueKey }),
    (lng, lat, count, expandZoom, uniqueKey, clusterId) => ({
      lng,
      lat,
      count,
      expandZoom,
      uniqueKey,
      clusterId,
    })
  );
```

# Class: MarkerCluster<T\>

### [Constructor](#constructor)

### Methods

- [load](#load)
- [loadAsync](#loadasync)
- [setZoom](#setzoom)
- [setBounds](#setbounds)
- [getPoints](#getpoints)
- [getChildren](#getchildren)
- [cleanup](#cleanup)

### Properties

- [points](#points)
- [isLoading](#isloading)
- [callback](#callback)
- [worker](#worker)

## Constructor

```ts
constructor(getLngLat: (item: T) => [lng: number, lat: number], options: MarkerClusterOptions)
```

#### MarkerClusterOptions

| Name        | Type         | Description                               | Default |
| :---------- | :----------- | :---------------------------------------- | :------ |
| `minZoom?`  | `number`     | min zoom level to cluster the points on   | `0`     |
| `maxZoom?`  | `number`     | max zoom level to cluster the points on   | `16`    |
| `radius?`   | `number`     | cluster radius in pixels                  | `60`    |
| `extent?`   | `number`     | size of the tile grid used for clustering | `256`   |
| `callback?` | `() => void` | see [callback](#callback)                 |         |

## Methods

### load

```ts
load(points: T[]): this
```

Loads the given `points` and clusters them for each zoom level

#### Parameters

| Name     | Type  | Description                |
| :------- | :---- | :------------------------- |
| `points` | `T`[] | The points to be clustered |

---

### loadAsync

```ts
async loadAsync(points: T[]): Promise<this>
```

Loads the given points and asynchronously clusters them for each zoom level

> Note: this method use [Worker](https://developer.mozilla.org/en-US/docs/Web/API/Worker/Worker) and fallbacks to [load](#load) method if [worker](#worker) initializing was failed

---

### setZoom

```ts
setZoom(zoom: number): this
```

Sets current zoom level for [getPoints](#getpoints) method

---

### setBounds

```ts
setBounds(
  westLng: number,
  southLat: number,
  eastLng: number,
  northLat: number
): this
```

Sets current bounds for [getPoints](#getpoints) method

---

### getPoints

```ts
getPoints<M, C>(
  markerMapper: (point: T, uniqueKey: number) => M,
  clusterMapper: (
    lng: number,
    lat: number,
    count: number,
    expandZoom: number,
    uniqueKey: number,
    clusterId: number
  ) => C,
  expand?: number
): (M | C)[];
```

#### Parameters

| Name      | Type     | Description                                                                                                                     |
| :-------- | :------- | :------------------------------------------------------------------------------------------------------------------------------ |
| `expand?` | `number` | for values in range `(0..1)` considered as percentage, otherwise as absolute pixels value to expand given [bounds](#setbounds)} |

### Returns

Array of mapped clusters and points for the given [zoom](#setzoom) and [bounds](#setbounds)

---

### getChildren

```ts
getChildren<M, C>(
  clusterId: number,
  markerMapper: (point: T, uniqueKey: number) => M,
  clusterMapper: (
    lng: number,
    lat: number,
    count: number,
    expandZoom: number,
    uniqueKey: number,
    clusterId: number
  ) => C,
): (M | C)[];
```

### Returns

Array with mapped children of cluster

---

### cleanup

```ts
static cleanup(): void
```

if [loadAsync](#loadasync) was called, use this method to abandon [worker](#worker) if it needed

---

### points

```ts
points?: T[]
```

`points` from last executed [loadAsync](#loadasync) or [load](#load) method

---

### isLoading

```ts
isLoading: boolean;
```

Indicates whether a loading operation is currently in progress

---

### callback

```ts
callback: () => void;
```

Called once the loading operation has finished executing. The purpose of the method is to provide a way for developers to be notified when clustering is complete so that they can perform any additional processing or update the UI as needed.

---

### worker

```ts
static worker?: Worker;
```

[Worker](https://developer.mozilla.org/en-US/docs/Web/API/Worker/Worker) instance, inits at first [loadAsync](#loadasync) call

---

## Benchmark

```
marker-cluster x 915 ops/sec ±1.65% (91 runs sampled)
supercluster x 148 ops/sec ±1.12% (84 runs sampled)
Fastest in loading 1,000 points is marker-cluster

marker-cluster x 53.21 ops/sec ±0.97% (70 runs sampled)
supercluster x 16.70 ops/sec ±1.63% (45 runs sampled)
Fastest in loading 10,000 points is marker-cluster

marker-cluster x 2.18 ops/sec ±2.44% (10 runs sampled)
supercluster x 1.32 ops/sec ±1.22% (8 runs sampled)
Fastest in loading 100,000 points is marker-cluster
```

## License

MIT © [Krombik](https://github.com/Krombik)
