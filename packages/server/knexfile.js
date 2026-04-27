import path from 'path';
const config = {
    client: 'better-sqlite3',
    connection: {
        filename: process.env.DB_PATH || './determinant.db'
    },
    useNullAsDefault: true,
    migrations: {
        directory: path.join(__dirname, 'migrations'),
        extension: 'ts',
        tableName: 'knex_migrations',
        loadExtensions: ['.ts']
    }
};
export default config;
//# sourceMappingURL=knexfile.js.map