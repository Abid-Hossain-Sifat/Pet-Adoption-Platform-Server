require ('dotenv').config();

const express = require('express');
const app = express();
const cors = require('cors');



app.use(cors());
app.use(express.json());

const port = process.env.PORT;



app.get ('/', (req, res) =>{
    res.send ('Pet Adoption Platform Project server live Now')
})


app.listen (port, (req, res) =>{
    console.log (`Pet Adoption Platform Project server live on port ${port}`)
})