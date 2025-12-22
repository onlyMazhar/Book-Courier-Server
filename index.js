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
app.use(
    cors({
        // origin: 'https://voluble-basbousa-85ef54.netlify.app',
        origin: 'http://localhost:5173',
        credentials: true,
    })
);

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
        const paymentCollection = db.collection("payments")
        const usersCollection = db.collection("users")
        const wishlistCollection = db.collection("wishlis")




        /* ================= ADMIN VERIFY MIDDLEWARE ================= */
        const verifyAdmin = async (req, res, next) => {
            const email = req.headers.email;

            if (!email) {
                return res.status(401).send({ message: 'Unauthorized access' });
            }

            const user = await usersCollection.findOne({ email });

            if (user?.role !== 'admin') {
                return res.status(403).send({ message: 'Forbidden access' });
            }

            next();
        };





        app.post("/books", async (req, res) => {
            const book = req.body;
            const result = await booksCollection.insertOne(book);
            res.send(result);
        });

        app.get("/books", async (req, res) => {
            const result = await booksCollection
                .find({ status: 'published' })
                .toArray();
            res.send(result);
        });

        //  Latest books
        app.get("/latest-books", async (req, res) => {
            const result = await booksCollection.find().sort({ _id: -1 }).limit(6).toArray();
            res.send(result);
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

        // get single book for edit
        app.get('/books/edit/:id', async (req, res) => {
            const book = await booksCollection.findOne({
                _id: new ObjectId(req.params.id)
            });
            res.send(book);
        });

        // update book (no delete)
        app.patch('/books/edit/:id', async (req, res) => {
            const updatedData = req.body;

            delete updatedData._id; // safety

            const result = await booksCollection.updateOne(
                { _id: new ObjectId(req.params.id) },
                { $set: updatedData }
            );

            res.send(result);
        });


        app.patch('/orders/:id/cancel', async (req, res) => {
            const { id } = req.params;
            const result = await ordersCollection.updateOne(
                { _id: new ObjectId(id), status: 'pending' },
                { $set: { status: 'cancelled' } }
            );
            res.send(result);
        });





        // order store  api
        app.post('/orders', async (req, res) => {
            const bookOrder = req.body;

            const result = await ordersCollection.insertOne({
                ...bookOrder,
                createdAt: new Date(),
                status: 'pending',
                paymentStatus: 'unpaid',
            });

            res.status(201).send({
                success: true,
                message: "Order placed successfully",
                orderId: result.insertedId,
            });
        });

        // order get api
        app.get('/orders', async (req, res) => {
            const query = {};
            const { email } = req.query;
            if (email) {
                query.customerEmail = email
            }
            const options = { sort: { createdAt: -1 } }
            const cursor = ordersCollection.find(query, options)
            const result = await cursor.toArray()
            res.send(result)
        })

        // cancel orders ( Users only )
        app.patch('/orders/cancel/:id', async (req, res) => {
            const { id } = req.params;

            const order = await ordersCollection.findOne({ _id: new ObjectId(id) });

            if (!order) {
                return res.status(404).send({ message: 'Order not found' });
            }

            if (order.status !== 'pending') {
                return res.status(400).send({ message: 'Only pending orders can be cancelled' });
            }

            const result = await ordersCollection.updateOne(
                { _id: new ObjectId(id) },
                {
                    $set: {
                        status: 'cancelled',
                        paymentStatus: 'cancelled'
                    }
                }
            );

            res.send({ success: true, result });
        });

        // const ordersCollection = db.collection("orders"); // make sure this is defined

        // Update order status
        app.patch('/orders/:id/status', async (req, res) => {
            const { id } = req.params;
            const { status } = req.body;

            if (!['pending', 'shipped', 'delivered'].includes(status)) {
                return res.status(400).send({ message: 'Invalid status' });
            }

            try {
                const result = await ordersCollection.updateOne(
                    { _id: new ObjectId(id) },
                    { $set: { status } }
                );

                if (result.matchedCount === 0) {
                    return res.status(404).send({ message: 'Order not found' });
                }

                res.send({ success: true, message: 'Order status updated', status });
            } catch (err) {
                console.error(err);
                res.status(500).send({ message: 'Server error' });
            }
        });

        // Cancel an order
        app.patch('/orders/:id/cancel', async (req, res) => {
            const { id } = req.params;

            try {
                const result = await ordersCollection.updateOne(
                    { _id: new ObjectId(id) },
                    { $set: { status: 'cancelled' } }
                );

                if (result.matchedCount === 0) {
                    return res.status(404).send({ message: 'Order not found' });
                }

                res.send({ success: true, message: 'Order cancelled', status: 'cancelled' });
            } catch (err) {
                console.error(err);
                res.status(500).send({ message: 'Server error' });
            }
        });

        app.post('/wishlist', async (req, res) => {
            const item = req.body;
            // Check if already exists
            const query = { bookId: item.bookId, userEmail: item.userEmail };
            const existing = await wishlistCollection.findOne(query);
            if (existing) {
                return res.status(400).send({ message: "Book already in wishlist" });
            }
            const result = await wishlistCollection.insertOne(item);
            res.send(result);
        });

        // Get user-specific wishlist
        app.get('/wishlist/:email', async (req, res) => {
            const email = req.params.email;
            const result = await wishlistCollection.find({ userEmail: email }).toArray();
            res.send(result);
        });








        // get all add book by Librarian   with email
        app.get('/my-books', async (req, res) => {
            const { email } = req.query;

            if (!email) {
                return res.status(400).send({ message: 'Email required' });
            }

            const result = await booksCollection
                .find({ 'librarian.email': email })
                .sort({ createdAt: -1 })
                .toArray();

            res.send(result);
        });

        // get all orders for for Librarian   by email
        app.get('/manage-orders', async (req, res) => {
            const { email } = req.query;

            if (!email) {
                return res.status(400).send({ message: 'Email required' });
            }

            const result = await ordersCollection
                .find({ librarian: email })
                .sort({ createdAt: -1 })
                .toArray();

            res.send(result);
        });
        // update book publish status (librarian only)
        app.patch('/books/status/:id', async (req, res) => {
            const { id } = req.params;
            const { status } = req.body;

            if (!['published', 'unpublished'].includes(status)) {
                return res.status(400).send({ message: 'Invalid status' });
            }

            const result = await booksCollection.updateOne(
                { _id: new ObjectId(id) },
                { $set: { status } }
            );

            res.send(result);
        });




        // stripe 
        app.post('/create-checkout-seassion', async (req, res) => {
            const orderInfo = req.body;
            // console.log("_______SESSION DATA_______",session)
            console.log("------------------------------All order Info From server------------------", orderInfo)

            const session = await stripe.checkout.sessions.create({
                line_items: [
                    {
                        price_data: {
                            currency: 'usd',
                            product_data: {
                                name: orderInfo?.bookName,
                                images: [orderInfo?.bookImg]
                            },
                            unit_amount: orderInfo?.price * 100
                        },
                        quantity: 1,
                    },
                ],
                customer_email: orderInfo.customer.customerEmail,
                mode: 'payment',
                metadata: {
                    bookId: orderInfo.bookId,
                    bookName: orderInfo.bookName,
                    price: orderInfo.price,
                    customerEmail: orderInfo.customer.customerEmail,
                    librarian: orderInfo.librarian,
                    writtenBy: orderInfo.writtenBy,
                    category: orderInfo.category
                },
                success_url: `${process.env.CLIENT_DOMAIN}/payment-success?session_id={CHECKOUT_SESSION_ID}`,
                cancel_url: `${process.env.CLIENT_DOMAIN}/books/${orderInfo?.bookId}`
            })
            res.send({ url: session.url })
        })

        // from video 
        app.post('/payment-success', async (req, res) => {
            const { sessionId } = req.body
            const session = await stripe.checkout.sessions.retrieve(sessionId)

            console.log(session)

            const book = await ordersCollection.findOne({
                _id: new ObjectId(session.metadata.bookId)
            })

            const inOrder = await paymentCollection.findOne({
                transactionId: session.payment_intent
            })
            // console.log('order transcation id', inOrder)


            if (session.status === 'complete' && book && !inOrder) {
                const paymentInfo = {
                    bookId: session.metadata.bookId,
                    transactionId: session.payment_intent,
                    customer: session.customer_email,
                    status: 'pending',
                    librarian: session.metadata.librarian,
                    name: session.metadata.bookName,
                    quantity: 1,
                    price: session.amount_total / 100,
                    createdAt: new Date()
                }

                // result
                // console.log("---------------------All payment Info Here------------------", paymentInfo)
                const result = await paymentCollection.insertOne(paymentInfo)
                const updateResult = await booksCollection.updateOne(
                    { name: session.metadata.bookName },
                    { $inc: { quantity: -1 } }
                );
                await ordersCollection.updateOne(
                    { _id: new ObjectId(session.metadata.bookId) },
                    {
                        $set: {
                            status: 'paid',
                            paymentStatus: 'paid'
                        }
                    }
                );

                return res.send({
                    transactionId: session.payment_intent,
                    orderId: result.insertedId
                })

            }



            res.send({
                Message: 'alreday exist in order list',
                transactionId: session.payment_intent,
                orderId: inOrder._id
            })

        })

        // get all invoices (payments) for a customer
        app.get('/my-invoices', async (req, res) => {
            const { email } = req.query;

            if (!email) {
                return res.status(400).send({ message: 'Email is required' });
            }

            const result = await paymentCollection
                .find({ customer: email })
                .sort({ _id: -1 }) // latest first
                .toArray();

            res.send(result);
        });


        app.post('/user', async (req, res) => {
            const userData = req.body
            userData.created_at = new Date().toISOString()
            userData.last_loggedIn = new Date().toISOString()
            userData.role = 'user'

            const query = { email: userData.email }

            const doesExists = await usersCollection.findOne(query)
            console.log("User Already exists-------->>>>> ", !!doesExists)

            if (doesExists) {
                console.log("Updating User Info...............")
                const result = await usersCollection.updateOne(query, {
                    $set: {
                        last_loggedIn: new Date().toISOString()
                    }
                })
                return res.send(result)
            }
            console.log("saving new User info..............")
            const result = await usersCollection.insertOne(userData)

            res.send(result)
        })


        // get user's role
        app.get('/user/role/:email', async (req, res) => {
            const email = req.params.email
            const result = await usersCollection.findOne({ email })
            res.send({ role: result?.role })
        })

        app.get('/admin/users', verifyAdmin, async (req, res) => {
            const users = await usersCollection.find().toArray();
            res.send(users);
        });

        // update user role (admin only)
        app.patch('/admin/user/role/:id', verifyAdmin, async (req, res) => {
            const { id } = req.params;
            const { role } = req.body;

            if (!['admin', 'librarian'].includes(role)) {
                return res.status(400).send({ message: 'Invalid role' });
            }

            const result = await usersCollection.updateOne(
                { _id: new ObjectId(id) },
                { $set: { role } }
            );

            res.send(result);
        });

        /* ================================================= */



        app.get('/admin/books', verifyAdmin, async (req, res) => {
            const books = await booksCollection.find().toArray();
            res.send(books);
        });

        app.patch('/admin/book/:id/status', verifyAdmin, async (req, res) => {
            const { id } = req.params;
            const { status } = req.body;

            if (!['published', 'unpublished'].includes(status)) {
                return res.status(400).send({ message: 'Invalid status' });
            }

            const result = await booksCollection.updateOne(
                { _id: new ObjectId(id) },
                { $set: { status } }
            );
            res.send(result);
        });

        app.delete('/admin/book/:id', verifyAdmin, async (req, res) => {
            const { id } = req.params;

            // Delete book
            await booksCollection.deleteOne({ _id: new ObjectId(id) });

            // Delete related orders
            await ordersCollection.deleteMany({ bookId: id });

            res.send({ message: 'Book and related orders deleted' });
        });

        // await client.db("admin").command({ ping: 1 });
        // console.log("Pinged your deployment. You successfully connected to MongoDB!");

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
