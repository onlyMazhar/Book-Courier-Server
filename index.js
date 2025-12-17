require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const admin = require("firebase-admin");
const app = express();
const port = process.env.PORT || 3000;
/* Firebase Admin */
const decoded = Buffer
    .from(process.env.FB_SERVICE_KEY, "base64")
    .toString("utf-8");
const serviceAccount = JSON.parse(decoded);
admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
});

/*  Middleware */
app.use(express.json());
app.use(cors());



/* MongoDB */
const client = new MongoClient(process.env.MONGODB_URI, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});

async function run() {
    try {


        const db = client.db("bookCourier");
        const booksCollection = db.collection("books");

        /* Routes */
        app.post("/books", async (req, res) => {
            const book = req.body;
            const result = await booksCollection.insertOne(book);
            res.send(result);
        });

        app.get("/books", async (req, res) => {
            // const query = req.query;
            const result = await booksCollection.find().toArray()

            res.send(result)
        });

        app.get("/books/:id", async (req, res) => {
            const { id } = req.params;
            const objectId = new ObjectId(id)
            const result = await booksCollection.findOne({ _id: objectId })
            res.send({
                success: true,
                result
            });
        })


        await client.db("admin").command({ ping: 1 });
        console.log("Pinged your deployment. You successfully connected to MongoDB!");

    } finally {
        // do not close client
    }
}
run().catch(console.dir);

app.get("/", (req, res) => {
    res.send("Server Running");
});

app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});
