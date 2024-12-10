<div align="center">
  <h1>Nano-Vectordb-JS</h1>
  <p><strong>A simple, easy-to-hack Vector Database, the <a href="https://pypi.org/project/nano-vectordb/">js version</a> of NanoVectorDB</strong></p>

</div>




🌬️ A implementation of [NanoVectorDB](https://github.com/gusye1234/nano-vectordb) in js.

⚡ Fast speed to operate vectors.

🏃 Support naive [multi-tenancy](#Multi-Tenancy).



## Install

**Install from npm**

```shell
npm install nano-vectordb-js
```

**use in browser**:
- download the file `dbs.min.js` from [here](https://github.com/windfollowingheart/nano-vectordb-js/blob/master/browserjs/dbs.min.js)
- use it in your html file:
```html
<script src="dbs.min.js"></script>
```
the example is in the file [here](https://github.com/windfollowingheart/nano-vectordb-js/blob/master/browserjs/test.html)


## Quick Start

**Faking your data**:

```js
// Set data length and dimension
const dataLen = 100;
const fakeDim = 1536;

// Generate a random matrix (dataLen x fakeDim)
function generateRandomMatrix(rows, cols) {
    return Array.from({ length: rows }, () =>
        new Float32Array(Array.from({ length: cols }, () => Math.random()))
    );
}

// Generate random matrix
const fakeEmbeds = generateRandomMatrix(dataLen, fakeDim);

// Print matrix shape (for debugging only)
console.log(`Shape: [${dataLen}, ${fakeDim}]`);

// Building fake data
const fakesData = Array.from({ length: dataLen }, (_, i) => ({
    __vector__: fakeEmbeds[i],
    __id__: i.toString()
}));

// Example output the first few elements to verify the result
console.log(fakesData.slice(0, 1));
```
*output*:
```
[
  {
    __vector__: Float32Array(1536) [
       0.7478081583976746,   0.817471444606781, 
       ...,
       8189947009086609,
         0.8611364364624023,
       0.4231139123439789,
      ... 1436 more items
    ],
    __id__: 0
  }
]
```

You can add any fields to a data. But there are two keywords:

- `__id__`: If passed, `NanoVectorDB` will use your id, otherwise a generated id will be used.
- `__vector__`: must pass, your embedding type is `Float32Array`.

### Init a DB

```js
// Nodejs
const dbs = require("nano-vectordb-js"); 
const vdb = new dbs.NanoVectorDB({
        embedding_dim: fakeDim, 
        metric: "cosine", 
        storage_file: "test.json", 
    });

// ES6
// import { NanoVectorDB } from "nano-vectordb-js";
// const vdb = new dbs.NanoVectorDB({
//         embedding_dim: fakeDim, 
//         metric: "cosine", 
//         storage_file: "test.json", 
//     });
```
you can also use `postInit` to init the db sync in async function:

```js
(async() => {
    const vdb = new dbs.NanoVectorDB({
        embedding_dim: fakeDim, 
        metric: "cosine", 
        storage_file: "test.json", 
        isSync: true
    });
    await vdb.postInit()
    r = vdb.upsert(fakesData)
    console.log(r["update"], r["insert"])
})()
```

Next time you init `vdb` from `test.json`, `NanoVectorDB` will load the index automatically.

### Upsert

```js
setTimeout(() => {
r = vdb.upsert(fakesData);
console.log(r["update"], r["insert"]);
}, 1000);
```

### Query

```js
setTimeout(() => {
    // query with embedding 
    const queryData = Float32Array.from({ length: fakeDim }, () => Math.random());

    // arguments:
    const topK = 5;
    const betterThanThreshold = 0.01;
    const queryResult = vdb.query(queryData, topK, betterThanThreshold);
    console.log(queryResult);
}, 1000);
```

#### Conditional filter

```js
setTimeout(() => {
    const queryData = Float32Array.from({ length: fake_dim }, () => Math.random());
    const topK = 5;
    const betterThanThreshold = 0.01;
    const queryResult =vdb.query(queryData, topK, betterThanThreshold, (data) => parseInt(data.__id__) >= 70); // when  __id__ is a string of number
    // const queryResult = vdb.query(queryData, topK, betterThanThreshold, (data) => data.__id__ === "ANY_STRING"); // when __id__ is a string
}, 1000);
```

### Save

```js
// will create/overwrite 'test.json'
vdb.save()
```

### Get, Delete

```js

setTimeout(() => {
    const ids = vdb.get([vdb.storage.data[0][dbs.F_ID]]);
    console.log(ids);
    ids.forEach(id => {
        console.log(id);
        vdb.delete([id[dbs.F_ID]]);
    })
    console.log(vdb.get(ids));
}, 1000);
```

### Additional Data

```js
setTimeout(() => {
    vdb.storeAdditionalData({a:1, b:2, c:3});
    console.log(vdb.getAdditionalData());
}, 1000);
```

## Multi-Tenancy

If you have multiple vectorDB to use, you can use `MultiTenantNanoVDB` to manage:

`MultiTenantNanoVDB` use a queue to manage the total vector dbs in memory, you can adjust the parameter: `max_capacity`.

```js
const dbs = require("nano-vectordb-js"); // Nodejs
// import { MultiTenantNanoVDB } from "nano-vectordb-js"; // ES6

const multiTenant = new dbs.MultiTenantNanoVDB(1024, "cosine", 1000, "./test");
// const multiTenant = new MultiTenantNanoVDB(1024, "cosine", 1000, "./test");
const tenantId = multiTenant.createTenant("1");

// tenant is a NanoVectorDB, you can upsert, query, get... on this.
const tenant = multiTenant.getTenant(tenantId);
console.log(tenant);

// some chores:
multiTenant.containTenant(tenantId);
multiTenant.deleteTenant(tenantId);
multiTenant.containTenant(tenantId);

// save it
multiTenant.save();
```





