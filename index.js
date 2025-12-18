require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const admin = require("firebase-admin");
const stripe = require('stripe')(process.env.STRIPE_API_KEY)
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
        const ordersCollection = db.collection("orders")






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

        // order store  api
        app.post('/orders', async (req, res) => {
            const bookOrder = req.body;
            const result = await ordersCollection.insertOne(bookOrder)
            res.send(result)
        })

        // order get api
        app.get('/orders', async (req, res) => {
            const result = await ordersCollection.find().toArray()
            res.send(result)
        })

        // stripe 
        app.post('/create-checkout-seassion', async (req, res) => {
            const paymentInfo = req.body;
            console.log(paymentInfo)

            const session = await stripe.checkout.sessions.create({
                line_items: [
                    {
                        price_data: {
                            currency: 'usd',
                            product_data: {
                                name: paymentInfo?.name,
                                images: [paymentInfo?.image]
                            },
                            unit_amount: paymentInfo?.price * 100
                        },
                        quantity: paymentInfo?.quantity,
                    },
                ],
                customer_email: paymentInfo?.customer?.email,
                mode: 'payment',
                metadata: {
                    bookId: paymentInfo?.bookID,
                    customer: paymentInfo?.customer?.email
                },
                success_url: `${process.env.CLIENT_DOMAIN}/payment-success`,
                cancel_url: `${process.env.CLIENT_DOMAIN}/books/${paymentInfo?.bookID}`
            })
            res.send({ url: session.url })
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
