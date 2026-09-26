import { DataTypes } from "sequelize";

export default {
    name: "plantPhoto",
    define: {
        plantId: {
            type: DataTypes.INTEGER,
            allowNull: false,
            unique: true,
            references: { model: "plants", key: "id" },
            onDelete: "CASCADE"
        },
        imageData: {
            type: DataTypes.BLOB("long"),
            allowNull: false
        },
        mimeType: {
            type: DataTypes.STRING(100),
            allowNull: false
        }
    },
    options: {
        tableName: "plant_photos",
        timestamps: true
    }
};
