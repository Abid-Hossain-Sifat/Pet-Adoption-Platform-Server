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
        const requestsCollection = Data.collection('adoption_requests')

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

        // --- ADOPTION REQUESTS ENDPOINTS ---

        app.post ('/adoption-requests', async (req, res) => {
            try {
                const requestData = req.body;
                const existing = await requestsCollection.findOne({
                    petId: requestData.petId,
                    requesterEmail: requestData.requesterEmail
                });
                if (existing) {
                    return res.status(400).send({ message: "You have already applied for this pet!" });
                }
                const result = await requestsCollection.insertOne(requestData);
                res.status(201).send(result);
            } catch (error) {
                console.error("Error creating adoption request:", error);
                res.status(500).send({ message: "Failed to submit request", error });
            }
        })

        app.get ('/adoption-requests', async (req, res) => {
            try {
                const { petId, requesterEmail } = req.query;
                let query = {};
                if (petId) {
                    query.petId = petId;
                }
                if (requesterEmail) {
                    query.requesterEmail = requesterEmail;
                }
                const result = await requestsCollection.find(query).toArray();
                res.send(result);
            } catch (error) {
                console.error("Error fetching adoption requests:", error);
                res.status(500).send({ message: "Failed to fetch requests", error });
            }
        })

        app.put ('/adoption-requests/:id/approve', async (req, res) => {
            try {
                const id = req.params.id;
                const request = await requestsCollection.findOne({ _id: new ObjectId(id) });
                if (!request) {
                    return res.status(404).send({ message: "Request not found" });
                }
                const petId = request.petId;

                // 1. Approve this request
                await requestsCollection.updateOne(
                    { _id: new ObjectId(id) },
                    { $set: { status: 'approved' } }
                );

                // 2. Reject all other requests for this pet
                await requestsCollection.updateMany(
                    { petId: petId, _id: { $ne: new ObjectId(id) } },
                    { $set: { status: 'rejected' } }
                );

                // 3. Update the pet's status to 'Adopted'
                await collection.updateOne(
                    { _id: new ObjectId(petId) },
                    { $set: { status: 'Adopted' } }
                );

                res.send({ message: "Request approved and others rejected successfully!" });
            } catch (error) {
                console.error("Error approving request:", error);
                res.status(500).send({ message: "Failed to approve request", error });
            }
        })

        app.put ('/adoption-requests/:id/reject', async (req, res) => {
            try {
                const id = req.params.id;
                const result = await requestsCollection.updateOne(
                    { _id: new ObjectId(id) },
                    { $set: { status: 'rejected' } }
                );
                res.send(result);
            } catch (error) {
                console.error("Error rejecting request:", error);
                res.status(500).send({ message: "Failed to reject request", error });
            }
        })

        app.delete ('/adoption-requests/:id', async (req, res) => {
            try {
                const id = req.params.id;
                const query = { _id: new ObjectId(id) };
                const result = await requestsCollection.deleteOne(query);
                res.send(result);
            } catch (error) {
                console.error("Error deleting request:", error);
                res.status(500).send({ message: "Failed to delete request", error });
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