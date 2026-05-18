require ('dotenv').config();

const express = require('express');
const app = express();
const cors = require('cors');
const { MongoClient, ServerApiVersion } = require('mongodb');



app.use(cors());
app.use(express.json());

const port = process.env.PORT;
const uri = process.env.MongoDB_URI;


const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});


const run = async () => {
    try {
        await client.connect();

        const Data = client.db('Pets')
        const collection = Data.collection('all_pets')

        app.get ('/pets', async (req, res) => {
            const cursor = collection.find ()
            const result = await cursor.toArray()

            res.send (result)
        })


        await client.db('admin').command ({ ping: 1 })
        console.log ('ping deploy successfully')
    }
    catch (error) {
        console.log (error)
    }
    finally {

    }
}
run().catch(console.dir)



app.get ('/', (req, res) =>{
    res.send ('Pet Adoption Platform Project server live Now')
})


app.listen (port, (req, res) =>{
    console.log (`Pet Adoption Platform Project server live on port ${port}`)
})