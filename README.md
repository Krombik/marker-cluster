# marker-cluster

Typescript library for point clustering

#### Why should I use MarkerCluster?

- it is really fast
- it could leverage [Worker](https://developer.mozilla.org/en-US/docs/Web/API/Worker/Worker) to avoid freezing while clustering a large amount of points
- it does not dictate supplied points format
- format of returned points is customizable

## Example

```ts
import MarkerCluster from 'marker-cluster';

const markerCluster = new MarkerCluster<Point>({
  getLatLng: (v) => [v.lng, v.lat],
  radius: 60,
});

markerCluster.load(points);

const currPoints = markerCluster.getPoints(
  2,
  -180,
  -85,
  180,
  85,
  (point, lng, lat) => ({ point, lng, lat }),
  (lng, lat, count, clusterId) => ({ count, clusterId, lng, lat }),
  10
);
```

# Class: MarkerCluster<T\>

### [Constructor](#constructor)

### Methods

- [load](#load)
- [loadAsync](#loadasync)
- [getPoints](#getpoints)
- [getZoom](#getzoom)
- [getChildren](#getchildren)

### Properties

- [points](#points)
- [worker](#worker)

## Constructor

```ts
constructor(options: MarkerClusterOptions<T>)
```

| Name        | Type                                                | Description                                       | Default |
| :---------- | :-------------------------------------------------- | :------------------------------------------------ | :------ |
| `extent?`   | `number`                                            | tile extent (radius is calculated relative to it) | `256`   |
| `maxZoom?`  | `number`                                            | max zoom level to cluster the points on           | `16`    |
| `minZoom?`  | `number`                                            | min zoom level to cluster the points on           | `0`     |
| `radius?`   | `number`                                            | cluster radius in pixels                          | `60`    |
| `getLngLat` | (`item`: `T`) => [`lng`: `number`, `lat`: `number`] |                                                   |         |

## Methods

### load

```ts
load(points: T[]): void
```

Loads given `points`

#### Parameters

| Name     | Type  | Description           |
| :------- | :---- | :-------------------- |
| `points` | `T`[] | points for clustering |

---

### loadAsync

```ts
async loadAsync(points: T[]): Promise<void>
```

Same to [load](#load), but do clustering at another thread

> Note: this method use [Worker](https://developer.mozilla.org/en-US/docs/Web/API/Worker/Worker)

---

### getPoints

```ts
getPoints<M, C>(
  zoom: number,
  westLng: number,
  southLat: number,
  eastLng: number,
  northLat: number,
  markerMapper: (point: T, lng: number, lat: number) => M,
  clusterMapper: (lng: number, lat: number, count: number, clusterId: number) => C,
  expand?: number
): (M | C)[]
```

#### Parameters

| Name      | Type     | Description                                                                                                         |
| :-------- | :------- | :------------------------------------------------------------------------------------------------------------------ |
| `expand?` | `number` | for values in range (0..1) considered as percentage, otherwise as absolute pixels value to expand given `boundary`. |

### Returns

Array of clusters and points for the given `zoom` and `boundary`

---

### getZoom

```ts
getZoom(clusterId: number): number
```

#### Returns

Zoom level on which the cluster splits into several children, or **`-1`** if it cluster of several points with same coords

---

### getChildren

```ts
getChildren(clusterId: number): (T | { clusterId: number; count: number })[]
```

## Properties

### points

```ts
points?: T[]
```

`points` from last executed [loadAsync](#loadasync) or [load](#load)

---

### worker

```ts
worker?: Worker;
```

[Worker](https://developer.mozilla.org/en-US/docs/Web/API/Worker/Worker) instance, inits at first [loadAsync](#loadasync) call
