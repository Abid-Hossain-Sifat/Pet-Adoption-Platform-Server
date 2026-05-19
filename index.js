require ('dotenv').config();

const express = require('express');
const app = express();
const cors = require('cors');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const { auth } = require("./auth.js");
const { toNodeHandler } = require("better-auth/node");



app.use(cors({
    origin: "http://localhost:3000",
    credentials: true
}));

app.all("/api/auth/*splat", toNodeHandler(auth));
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
            try {
                const email = req.query.email;
                let query = {};
                if (email) {
                    query = { email: email };
                }
                const cursor = collection.find(query)
                const result = await cursor.toArray()
                res.send (result)
            } catch (error) {
                console.error("Error fetching pets:", error);
                res.status(500).send({ message: "Failed to fetch pets", error });
            }
        })

        app.post ('/pets', async (req, res) => {
            try {
                const petData = req.body;
                const result = await collection.insertOne(petData);
                res.status(201).send(result);
            } catch (error) {
                console.error("Error inserting pet:", error);
                res.status(500).send({ message: "Failed to add pet", error });
            }
        })

        app.delete ('/pets/:id', async (req, res) => {
            try {
                const id = req.params.id;
                const query = { _id: new ObjectId(id) };
                const result = await collection.deleteOne(query);
                res.send(result);
            } catch (error) {
                console.error("Error deleting pet:", error);
                res.status(500).send({ message: "Failed to delete pet", error });
            }
        })

        app.put ('/pets/:id', async (req, res) => {
            try {
                const id = req.params.id;
                const petData = req.body;
                const { _id, ...updateData } = petData;
                const query = { _id: new ObjectId(id) };
                const updateDoc = {
                    $set: updateData,
                };
                const result = await collection.updateOne(query, updateDoc);
                res.send(result);
            } catch (error) {
                console.error("Error updating pet:", error);
                res.status(500).send({ message: "Failed to update pet", error });
            }
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