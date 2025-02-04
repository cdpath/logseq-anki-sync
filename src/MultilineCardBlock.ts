import { Block } from "./block";
import '@logseq/libs'
import _ from 'lodash';
import * as Converter from './Converter';

export class MultilineCardBlock extends Block {
    public type: string = "multiline_card";
    public children: any[];
    public tags: any[];
    public constructor(uuid: string, content: string, properties: any, page: any, tags: any = [], children: any = []) {
        super(uuid, content, properties, page);
        this.children = children;
        this.tags = tags;
    }

    public static initLogseqOperations = (() => { // Init logseq operations at start of the program
        logseq.Editor.registerSlashCommand("Card (Forward)", [
            ["editor/input", `#card #forward`],
            ["editor/clear-current-slash"],
        ]);
        logseq.Editor.registerSlashCommand("Card (Reversed)", [
            ["editor/input", `#card #reversed`],
            ["editor/clear-current-slash"],
        ]);
        logseq.Editor.registerSlashCommand("Card (Bidirectional)", [
            ["editor/input", `#card #bidirectional`],
            ["editor/clear-current-slash"],
        ]);
    });

    public addClozes(): MultilineCardBlock {
        let result = this.content;
        let direction = _.get(this, 'properties.direction');
        if(direction != "->" && direction != "<-" && direction != "<->") {
            if((this.tags.includes("reversed") && this.tags.includes("forward")) || this.tags.includes("bidirectional")) direction = "<->";
            else if(this.tags.includes("reversed")) direction = "<-";
            else direction = "->";
        } 

        // Add cloze to the parent block if direction is <-> or <-
        result = result.replace(/\{\{c\d+::(.*)\}\}/g, "$2");
        if(direction == "<->" || direction == "<-") 
            result = `{{c2:: ${result} \n}}`;
        
        // Add the content of children blocks and cloze it if direction is <-> or ->
        result+=`\n<ul class="children-list">`;
        for(const child of this.children) {
            result += `\n<li class="children">`;
            if(direction == "<->" || direction == "->")
                result += `{{c1::`;
            result += `${child.html_content.replace(/\{\{c\d+::(.*)\}\}/g, "$2")}`;
            if(direction == "<->" || direction == "->")
                result += ` }}`;
            result += `</li>`;
        }
        result += `</ul>`;

        this.content = result;
        return this;
    }


    public static async getBlocksFromLogseq(): Promise<MultilineCardBlock[]> {
        let logseqCard_blocks = await logseq.DB.datascriptQuery(`
        [:find (pull ?b [*])
        :where
        [?p :block/name "card"]
        [?b :block/refs ?p]
        ]`);
        let flashCard_blocks = await logseq.DB.datascriptQuery(`
        [:find (pull ?b [*])
        :where
        [?p :block/name "flashcard"]
        [?b :block/refs ?p]
        ]`);
        let blocks: any = [...logseqCard_blocks, ...flashCard_blocks];
        blocks = await Promise.all(blocks.map(async (block) => {
            let uuid = block[0].uuid["$uuid$"] || block[0].uuid.Wd;
            let page = (block[0].page) ? await logseq.Editor.getPage(block[0].page.id) : {};
            block = await logseq.Editor.getBlock(uuid,{includeChildren: true});
            if (block) {
                let tags = await Promise.all(_.map(block.refs, async page => { return _.get(await logseq.Editor.getPage(page.id), 'name') }));
                console.log(tags);
                let children = await Promise.all(_.map(block.children, 
                    async child => {
                        let child_extra = _.get(child,"properties.extra");
                        let child_content = _.get(child,"content") || "";
                        if(child_extra) {child_content += `\n<div class="extra">${child_extra}<div>`;}
                        return _.extend({html_content: await Converter.convertToHtml(child_content)}, child)
                    })) || [];
                return new MultilineCardBlock(uuid, block.content, block.properties || {}, page, tags, children);
            } else return null;    
        }));
        blocks = _.uniqBy(blocks, 'uuid');
        blocks = _.without(blocks, undefined, null);

        return blocks;
    }
}