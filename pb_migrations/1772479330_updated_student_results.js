/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbc_484031614")

  // add field
  collection.fields.addAt(7, new Field({
    "hidden": false,
    "id": "bool1152420362",
    "name": "is_exempt",
    "presentable": false,
    "required": false,
    "system": false,
    "type": "bool"
  }))

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_484031614")

  // remove field
  collection.fields.removeById("bool1152420362")

  return app.save(collection)
})
