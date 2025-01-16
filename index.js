const express = require("express");
const app = express();
require('dotenv').config()
const cors = require("cors");
const port = process.env.PORT || 9000;
const { MongoClient, ServerApiVersion } = require("mongodb");

//mid
app.use(express.json());
app.use(cors());




const uri =
  `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.ybjyx.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;
// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    const studySessionCollection = client.db("collaborative-study").collection('studySession')
    const userCollection = client.db("collaborative-study").collection('users')

    //user related API's
    app.get('/users', async(req, res)=>{
        const result = await userCollection.find().toArray()
        res.send(result)
    })
    app.post('/users', async(req, res)=>{
        const user = req.body;
        const result = await userCollection.insertOne(user)
        res.send(result)
    })

    //tutor related API's
    app.get('/studySession', async(req, res)=>{
        const result = await studySessionCollection.find().toArray()
        res.send(result)
    })
    app.get('/studySession/:email', async(req, res)=>{
      const email = req.params.email;
      const filter = { tutorEmail: email };
      const result = await studySessionCollection.find(filter).toArray();
      res.send(result)
    })
    //create study session
    app.post('/studySession', async(req,res)=>{
        const session = req.body;
        const result = await studySessionCollection.insertOne(session)
        res.send(result)
    })




    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {

  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("Server is Working");
});

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});
